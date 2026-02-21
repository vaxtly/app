/**
 * Remote sync service — 3-way merge, pull/push, conflict detection.
 * Port of app/Services/RemoteSyncService.php (~766 lines)
 *
 * Key concepts:
 * - `file_shas` on Collection stores per-file state: { path: { content_hash, remote_sha, commit_sha } }
 * - `remote_sha` on Collection is the _collection.yaml blob SHA
 * - 3-way merge: local content_hash vs base content_hash detects local changes;
 *   remote_sha vs stored remote_sha detects remote changes
 * - Conflict = same file changed both locally and remotely since last sync
 */

import { createHash } from 'crypto'
import { getDatabase } from '../database/connection'
import * as collectionsRepo from '../database/repositories/collections'
import * as settingsRepo from '../database/repositories/settings'
import * as workspacesRepo from '../database/repositories/workspaces'
import type { Collection, FileState } from '../../shared/types/models'
import type { FileContent, SyncResult, SyncConflict } from '../../shared/types/sync'
import type { GitProvider, DirectoryItem } from './git-provider.interface'
import { GitHubProvider } from './github-provider'
import { GitLabProvider } from './gitlab-provider'
import { serializeToDirectory, serializeRequest, importFromDirectory } from '../services/yaml-serializer'
import { logSync } from '../services/session-log'

const COLLECTIONS_PATH = 'collections'

// --- Provider management ---

function getSetting(key: string, workspaceId?: string): string | null {
  if (workspaceId) {
    const wsValue = workspacesRepo.getWorkspaceSetting(workspaceId, key)
    if (wsValue !== undefined) return wsValue
  }
  return settingsRepo.getSetting(key) ?? null
}

export function getProvider(workspaceId?: string): GitProvider | null {
  const providerType = getSetting('sync.provider', workspaceId)
  const repository = getSetting('sync.repository', workspaceId)
  const token = getSetting('sync.token', workspaceId)
  const branch = getSetting('sync.branch', workspaceId) ?? 'main'

  if (!providerType || !repository || !token) return null

  switch (providerType) {
    case 'github':
      return new GitHubProvider(repository, token, branch)
    case 'gitlab':
      return new GitLabProvider(repository, token, branch)
    default:
      return null
  }
}

export function isConfigured(workspaceId?: string): boolean {
  return getProvider(workspaceId) !== null
}

export async function testConnection(workspaceId?: string): Promise<boolean> {
  const provider = getProvider(workspaceId)
  if (!provider) return false
  return provider.testConnection()
}

// --- File state helpers ---

export function buildFileStateFromRemote(files: FileContent[]): Record<string, FileState> {
  const state: Record<string, FileState> = {}
  for (const file of files) {
    state[file.path] = {
      content_hash: createHash('sha256').update(file.content).digest('hex'),
      remote_sha: file.sha ?? null,
      commit_sha: file.commitSha ?? null,
    }
  }
  return state
}

export function normalizeFileState(
  fileState: Record<string, unknown>,
): Record<string, FileState> {
  const normalized: Record<string, FileState> = {}

  for (const [path, value] of Object.entries(fileState)) {
    if (typeof value === 'string') {
      // Old format: path => sha_string
      normalized[path] = {
        content_hash: '',
        remote_sha: value,
        commit_sha: null,
      }
    } else if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, string | null>
      normalized[path] = {
        content_hash: v.content_hash ?? '',
        remote_sha: v.remote_sha ?? null,
        commit_sha: v.commit_sha ?? null,
      }
    }
  }

  return normalized
}

export function hasRemoteFileChanges(
  storedFileShas: Record<string, unknown>,
  remoteItems: DirectoryItem[],
): boolean {
  const normalized = normalizeFileState(storedFileShas)

  const remoteShas: Record<string, string> = {}
  for (const item of remoteItems) {
    if (item.type === 'file') {
      remoteShas[item.path] = item.sha
    }
  }

  // Check for new or changed files on remote
  for (const [path, sha] of Object.entries(remoteShas)) {
    const stored = normalized[path]
    if (!stored || stored.remote_sha !== sha) return true
  }

  // Check for files deleted on remote
  for (const path of Object.keys(normalized)) {
    if (!(path in remoteShas)) return true
  }

  return false
}

// --- Pull ---

export async function pull(workspaceId?: string): Promise<SyncResult> {
  const result: SyncResult = { success: true, message: '', pulled: 0, pushed: 0, conflicts: [] }
  const provider = getProvider(workspaceId)

  if (!provider) {
    return { ...result, success: false, message: 'Remote not configured' }
  }

  let items: DirectoryItem[]
  try {
    items = await provider.listDirectoryRecursive(COLLECTIONS_PATH)
  } catch (e) {
    return { ...result, success: false, message: `Failed to list remote directories: ${(e as Error).message}` }
  }

  // Find all collection directories (directories with _collection.yaml)
  const collectionDirs: Record<string, string> = {}
  for (const item of items) {
    if (item.type === 'file' && item.path.endsWith('/_collection.yaml')) {
      const dirPath = item.path.slice(0, item.path.lastIndexOf('/'))
      const collectionId = dirPath.split('/').pop()!
      collectionDirs[collectionId] = dirPath
    }
  }

  const processedCollectionIds = new Set<string>()

  const errors: string[] = []

  for (const [collectionId, dirPath] of Object.entries(collectionDirs)) {
    try {
      if (processedCollectionIds.has(collectionId)) continue
      processedCollectionIds.add(collectionId)

      const files = await provider.getDirectoryTree(dirPath)
      if (files.length === 0) continue

      const collectionFile = files.find((f) => f.path.endsWith('/_collection.yaml'))
      if (!collectionFile) continue

      const localCollection = collectionsRepo.findById(collectionId)

      if (!localCollection) {
        // New collection from remote
        const newCollectionId = importFromDirectory(files, undefined, workspaceId)
        const newFileState = buildFileStateFromRemote(files)

        collectionsRepo.update(newCollectionId, {
          remote_sha: collectionFile.sha ?? null,
          file_shas: JSON.stringify(newFileState),
          remote_synced_at: new Date().toISOString(),
          sync_enabled: 1,
          is_dirty: 0,
        })

        result.pulled!++
        logSync('pull', collectionFile.path, 'New collection imported from remote')
      } else {
        // Check if ANY file changed on remote
        const remoteItems: DirectoryItem[] = files.map((f) => ({
          type: 'file' as const,
          path: f.path,
          sha: f.sha ?? '',
        }))

        const storedFileShas = localCollection.file_shas ? JSON.parse(localCollection.file_shas) : {}

        if (!hasRemoteFileChanges(storedFileShas, remoteItems)) {
          continue // No changes on remote
        }

        if (!localCollection.is_dirty) {
          // Remote wins - update local
          importFromDirectory(files, localCollection.id, workspaceId)
          const newFileState = buildFileStateFromRemote(files)

          collectionsRepo.update(localCollection.id, {
            remote_sha: collectionFile.sha ?? null,
            file_shas: JSON.stringify(newFileState),
            remote_synced_at: new Date().toISOString(),
            is_dirty: 0,
          })

          result.pulled!++
          logSync('pull', localCollection.name, 'Updated from remote')
        } else {
          // Conflict: both sides changed
          result.conflicts!.push({
            collectionId: localCollection.id,
            collectionName: localCollection.name,
            localUpdatedAt: localCollection.updated_at,
          })
          logSync('pull', localCollection.name, 'Conflict detected - both sides changed', false)
        }
      }
    } catch (e) {
      result.success = false
      errors.push(`${collectionId}: ${(e as Error).message}`)
    }
  }

  if (errors.length > 0) {
    result.message = `Failed to process ${errors.length} collection(s): ${errors.join('; ')}`
  } else if (result.pulled! > 0 || result.conflicts!.length > 0) {
    result.message = `Pulled ${result.pulled} collection(s)` +
      (result.conflicts!.length > 0 ? `, ${result.conflicts!.length} conflict(s)` : '')
  } else {
    result.message = 'Everything up to date'
  }

  return result
}

// --- Push ---

export async function pushCollection(
  collection: Collection,
  sanitize = false,
  workspaceId?: string,
): Promise<void> {
  const provider = getProvider(workspaceId)
  if (!provider) throw new Error('Remote not configured')

  const localFiles = serializeToDirectory(collection, { sanitize })
  const basePath = `${COLLECTIONS_PATH}/${collection.id}`

  // Get base state (content hashes + remote SHAs from last sync)
  const baseState = normalizeFileState(
    collection.file_shas ? JSON.parse(collection.file_shas) : {},
  )

  // Get current remote state
  const remoteItems = await provider.listDirectoryRecursive(basePath)
  const remoteShas: Record<string, string> = {}
  for (const item of remoteItems) {
    if (item.type === 'file') {
      remoteShas[item.path] = item.sha
    }
  }

  // 3-way merge: detect conflicts per file
  const conflicts: string[] = []
  const filesToPush: Record<string, string> = {}

  for (const [relativePath, content] of Object.entries(localFiles)) {
    const fullPath = `${COLLECTIONS_PATH}/${relativePath}`
    const localContentHash = createHash('sha256').update(content).digest('hex')

    const baseInfo = baseState[fullPath]
    const baseContentHash = baseInfo?.content_hash ?? null
    const baseRemoteSha = baseInfo?.remote_sha ?? null
    const remoteSha = remoteShas[fullPath] ?? null

    const localChanged = !baseContentHash || localContentHash !== baseContentHash
    const remoteChanged = baseRemoteSha !== null && remoteSha !== null && remoteSha !== baseRemoteSha

    if (remoteChanged && localChanged) {
      conflicts.push(fullPath)
    } else if (localChanged) {
      filesToPush[fullPath] = content
    }
  }

  if (conflicts.length > 0) {
    throw new SyncConflictError(conflicts)
  }

  // Detect orphaned files: exist on remote but not in local files anymore
  const localFullPaths = new Set(
    Object.keys(localFiles).map((rp) => `${COLLECTIONS_PATH}/${rp}`),
  )
  const filesToDelete: string[] = []
  for (const remotePath of Object.keys(remoteShas)) {
    if (!localFullPaths.has(remotePath)) {
      filesToDelete.push(remotePath)
    }
  }

  if (Object.keys(filesToPush).length === 0 && filesToDelete.length === 0) {
    collectionsRepo.update(collection.id, { is_dirty: 0 })
    return
  }

  // Commit changed and deleted files in a single atomic commit
  await provider.commitMultipleFiles(filesToPush, `Sync: ${collection.name}`, filesToDelete)

  // Build new file state locally (no extra API call needed)
  const newFileState: Record<string, FileState> = {}
  for (const [relativePath, content] of Object.entries(localFiles)) {
    const fullPath = `${COLLECTIONS_PATH}/${relativePath}`
    const contentHash = createHash('sha256').update(content).digest('hex')
    // Compute blob SHA: SHA-1 of "blob {size}\0{content}"
    const blobSha = createHash('sha1')
      .update(`blob ${Buffer.byteLength(content)}\0${content}`)
      .digest('hex')

    newFileState[fullPath] = {
      content_hash: contentHash,
      remote_sha: blobSha,
      commit_sha: null,
    }
  }

  // Store _collection.yaml blob SHA as remote_sha
  const collectionYamlPath = `${basePath}/_collection.yaml`
  const collectionRemoteSha = newFileState[collectionYamlPath]?.remote_sha ?? null

  collectionsRepo.update(collection.id, {
    remote_sha: collectionRemoteSha,
    file_shas: JSON.stringify(newFileState),
    remote_synced_at: new Date().toISOString(),
    is_dirty: 0,
  })

  logSync('push', collection.name, 'Pushed to remote successfully')
}

// --- Pull single collection ---

export async function pullSingleCollection(collection: Collection, workspaceId?: string): Promise<boolean> {
  const provider = getProvider(workspaceId)
  if (!provider) throw new Error('Remote not configured')

  const basePath = `${COLLECTIONS_PATH}/${collection.id}`

  const remoteItems = await provider.listDirectoryRecursive(basePath)
  if (remoteItems.length === 0) return false

  const storedFileShas = collection.file_shas ? JSON.parse(collection.file_shas) : {}
  if (!hasRemoteFileChanges(storedFileShas, remoteItems)) return false

  if (collection.is_dirty) {
    throw new SyncConflictError(
      [basePath],
      `Conflict: local changes exist for '${collection.name}' and remote has been updated`,
    )
  }

  const files = await provider.getDirectoryTree(basePath)
  if (files.length === 0) throw new Error('Remote directory is empty')

  importFromDirectory(files, collection.id, workspaceId)

  const collectionFileSha = files.find((f) => f.path.endsWith('/_collection.yaml'))?.sha ?? null
  const newFileState = buildFileStateFromRemote(files)

  collectionsRepo.update(collection.id, {
    remote_sha: collectionFileSha,
    file_shas: JSON.stringify(newFileState),
    remote_synced_at: new Date().toISOString(),
    is_dirty: 0,
  })

  logSync('pull', collection.name, 'Pulled from remote successfully')
  return true
}

// --- Push all ---

export async function pushAll(workspaceId?: string): Promise<SyncResult> {
  const result: SyncResult = { success: true, message: '', pulled: 0, pushed: 0, conflicts: [] }

  const db = getDatabase()
  const collections = workspaceId
    ? db.prepare(`
        SELECT * FROM collections
        WHERE sync_enabled = 1
          AND workspace_id = ?
          AND (is_dirty = 1 OR remote_sha IS NULL)
      `).all(workspaceId) as Collection[]
    : db.prepare(`
        SELECT * FROM collections
        WHERE sync_enabled = 1
          AND workspace_id IS NULL
          AND (is_dirty = 1 OR remote_sha IS NULL)
      `).all() as Collection[]

  for (const collection of collections) {
    try {
      await pushCollection(collection, false, workspaceId)
      result.pushed!++
    } catch (e) {
      if (e instanceof SyncConflictError) {
        result.conflicts!.push({
          collectionId: collection.id,
          collectionName: collection.name,
          localUpdatedAt: collection.updated_at,
        })
      } else {
        result.success = false
        result.message += `Failed to push '${collection.name}': ${(e as Error).message}. `
      }
    }
  }

  if (result.pushed! > 0 || result.conflicts!.length > 0) {
    result.message = `Pushed ${result.pushed} collection(s)` +
      (result.conflicts!.length > 0 ? `, ${result.conflicts!.length} conflict(s)` : '')
  } else {
    result.message = 'Everything up to date'
  }

  return result
}

// --- Delete remote collection ---

export async function deleteRemoteCollection(collection: Collection, workspaceId?: string): Promise<void> {
  if (!collection.remote_sha) return

  const provider = getProvider(workspaceId)
  if (!provider) return

  const basePath = `${COLLECTIONS_PATH}/${collection.id}`

  try {
    await provider.deleteDirectory(basePath, `Delete collection: ${collection.name}`)
  } catch (e) {
    console.error('Failed to delete remote collection:', e)
  }
}

// --- Conflict resolution ---

export async function forceKeepLocal(collection: Collection, workspaceId?: string): Promise<void> {
  const provider = getProvider(workspaceId)
  if (!provider) throw new Error('Remote not configured')

  const localFiles = serializeToDirectory(collection)
  const basePath = `${COLLECTIONS_PATH}/${collection.id}`

  // Prepare files with full paths
  const filesWithFullPath: Record<string, string> = {}
  for (const [relativePath, content] of Object.entries(localFiles)) {
    filesWithFullPath[`${COLLECTIONS_PATH}/${relativePath}`] = content
  }

  // Detect orphaned remote files to delete
  const remoteItems = await provider.listDirectoryRecursive(basePath)
  const filesToDelete: string[] = []
  for (const item of remoteItems) {
    if (item.type === 'file' && !(item.path in filesWithFullPath)) {
      filesToDelete.push(item.path)
    }
  }

  await provider.commitMultipleFiles(
    filesWithFullPath,
    `Force sync (keep local): ${collection.name}`,
    filesToDelete,
  )

  // Build file state locally
  const newFileState: Record<string, FileState> = {}
  for (const [fullPath, content] of Object.entries(filesWithFullPath)) {
    newFileState[fullPath] = {
      content_hash: createHash('sha256').update(content).digest('hex'),
      remote_sha: createHash('sha1')
        .update(`blob ${Buffer.byteLength(content)}\0${content}`)
        .digest('hex'),
      commit_sha: null,
    }
  }

  const collectionYamlPath = `${basePath}/_collection.yaml`
  const collectionRemoteSha = newFileState[collectionYamlPath]?.remote_sha ?? null

  collectionsRepo.update(collection.id, {
    remote_sha: collectionRemoteSha,
    file_shas: JSON.stringify(newFileState),
    remote_synced_at: new Date().toISOString(),
    is_dirty: 0,
  })

  logSync('push', collection.name, 'Force pushed (keep local)')
}

export async function forceKeepRemote(collection: Collection, workspaceId?: string): Promise<void> {
  const provider = getProvider(workspaceId)
  if (!provider) throw new Error('Remote not configured')

  const remotePath = `${COLLECTIONS_PATH}/${collection.id}`
  const files = await provider.getDirectoryTree(remotePath)
  if (files.length === 0) throw new Error('Remote directory not found or empty')

  importFromDirectory(files, collection.id, workspaceId)

  const collectionFileSha = files.find((f) => f.path.endsWith('/_collection.yaml'))?.sha ?? null
  const newFileState = buildFileStateFromRemote(files)

  collectionsRepo.update(collection.id, {
    remote_sha: collectionFileSha,
    file_shas: JSON.stringify(newFileState),
    remote_synced_at: new Date().toISOString(),
    is_dirty: 0,
  })

  logSync('pull', collection.name, 'Force pulled (keep remote)')
}

// --- Single request push ---

export async function pushSingleRequest(
  collection: Collection,
  requestId: string,
  sanitize = false,
  workspaceId?: string,
): Promise<boolean> {
  const provider = getProvider(workspaceId)
  if (!provider) return false

  const db = getDatabase()

  try {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as
      | import('../../shared/types/models').Request
      | undefined
    if (!request) return false

    const content = serializeRequest(request, { sanitize })

    // Build path: collections/{collId}/{folderPath...}/{requestId}.yaml
    const folderPath = buildFolderPath(request.folder_id)
    const filePath = `${COLLECTIONS_PATH}/${collection.id}/${folderPath}${request.id}.yaml`

    // Get current file state
    const fileState = normalizeFileState(
      collection.file_shas ? JSON.parse(collection.file_shas) : {},
    )
    const existingState = fileState[filePath]
    const remoteSha = existingState?.remote_sha ?? null
    const commitSha = existingState?.commit_sha ?? null

    let newSha: string
    if (remoteSha) {
      // GitLab needs commit_sha, GitHub needs blob SHA (remote_sha)
      const shaForUpdate = commitSha ?? remoteSha
      newSha = await provider.updateFile(filePath, content, shaForUpdate, `Update: ${request.name}`)
    } else {
      newSha = await provider.createFile(filePath, content, `Create: ${request.name}`)
    }

    // Update only this file's entry in file_shas
    fileState[filePath] = {
      content_hash: createHash('sha256').update(content).digest('hex'),
      remote_sha: newSha,
      commit_sha: null,
    }

    collectionsRepo.update(collection.id, {
      file_shas: JSON.stringify(fileState),
      remote_synced_at: new Date().toISOString(),
      is_dirty: 0,
    })

    logSync('push', request.name, `Pushed to ${collection.name}`)
    return true
  } catch (e) {
    const statusCode = (e as any).statusCode ?? 0
    const message = ((e as Error).message ?? '').toLowerCase()

    // Treat 409 (GitHub) and 400 (GitLab) as conflicts — mark dirty for full push later
    if (statusCode === 409 || statusCode === 400 || message.includes('409') || message.includes('400')) {
      // Conflict — fall back to full collection push
    } else {
      console.warn(`[SYNC] Single-file push failed for request ${requestId}: ${(e as Error).message}`)
    }

    if (!collection.is_dirty) {
      collectionsRepo.markDirty(collection.id)
    }

    return false
  }
}

function buildFolderPath(folderId: string | null): string {
  if (!folderId) return ''

  const db = getDatabase()
  const segments: string[] = []
  let currentId: string | null = folderId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) break // cycle detection
    visited.add(currentId)
    const folder = db.prepare('SELECT id, parent_id FROM folders WHERE id = ?').get(currentId) as
      | { id: string; parent_id: string | null }
      | undefined
    if (!folder) break
    segments.unshift(folder.id)
    currentId = folder.parent_id
  }

  return segments.map((s) => `${s}/`).join('')
}

// --- Error types ---

export class SyncConflictError extends Error {
  constructor(
    public conflictedFiles: string[],
    message?: string,
  ) {
    super(message ?? `Sync conflict on files: ${conflictedFiles.join(', ')}`)
    this.name = 'SyncConflictError'
  }
}
