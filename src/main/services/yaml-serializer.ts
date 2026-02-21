/**
 * YAML Collection Serializer — serialize/import collections to/from YAML file maps.
 * Port of app/Services/YamlCollectionSerializer.php
 *
 * Must produce identical YAML directory structure for cross-version sync compatibility:
 *   collections/{uuid}/_collection.yaml
 *   collections/{uuid}/_manifest.yaml
 *   collections/{uuid}/{request_uuid}.yaml
 *   collections/{uuid}/{folder_uuid}/_folder.yaml
 *   collections/{uuid}/{folder_uuid}/_manifest.yaml
 *   ...nested...
 */

import yaml from 'js-yaml'
import { getDatabase } from '../database/connection'
import * as requestsRepo from '../database/repositories/requests'
import type {
  Collection,
  Folder,
  Request,
  KeyValueEntry,
  Environment,
} from '../../shared/types/models'
import type { FileContent } from '../../shared/types/sync'
import {
  sanitizeRequestData,
  sanitizeCollectionData,
} from './sensitive-data-scanner'

const COLLECTION_FILE = '_collection.yaml'
const FOLDER_FILE = '_folder.yaml'
const MANIFEST_FILE = '_manifest.yaml'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`Invalid UUID for ${label}: ${String(value).slice(0, 40)}`)
  }
  return value
}

interface ManifestItem {
  type: 'folder' | 'request'
  id: string
}

interface SerializeOptions {
  sanitize?: boolean
}

// --- YAML helpers ---

function toYaml(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: -1, // no line wrapping
    noRefs: true,
    sortKeys: false,
  })
}

function parseYaml(content: string): Record<string, unknown> {
  const result = yaml.load(content)
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid or empty YAML content')
  }
  return result as Record<string, unknown>
}

// --- Serialization ---

export function serializeToDirectory(
  collection: Collection,
  options: SerializeOptions = {},
): Record<string, string> {
  const db = getDatabase()
  const files: Record<string, string> = {}
  const basePath = collection.id

  // Load related data
  const folders = db
    .prepare('SELECT * FROM folders WHERE collection_id = ? ORDER BY "order" ASC')
    .all(collection.id) as Folder[]
  const requests = requestsRepo.findByCollection(collection.id)

  // Build lookup maps
  const foldersByParent = new Map<string | null, Folder[]>()
  for (const folder of folders) {
    const parentKey = folder.parent_id ?? '__root__'
    const list = foldersByParent.get(parentKey) ?? []
    list.push(folder)
    foldersByParent.set(parentKey, list)
  }

  const requestsByFolder = new Map<string | null, Request[]>()
  for (const request of requests) {
    const folderKey = request.folder_id ?? '__root__'
    const list = requestsByFolder.get(folderKey) ?? []
    list.push(request)
    requestsByFolder.set(folderKey, list)
  }

  // Collection metadata
  const environmentIds = parseJsonArray<string>(collection.environment_ids)
  let collectionData: Record<string, unknown> = {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    variables: parseJsonArray<KeyValueEntry>(collection.variables) ?? [],
    environment_ids: environmentIds,
    default_environment_id: collection.default_environment_id,
  }

  const hints = buildEnvironmentHints(environmentIds)
  if (Object.keys(hints).length > 0) {
    collectionData.environment_hints = hints
  }

  if (options.sanitize) {
    collectionData = sanitizeCollectionData(collectionData as never)
  }

  files[`${basePath}/${COLLECTION_FILE}`] = toYaml(collectionData)

  // Root level
  const rootFolders = foldersByParent.get('__root__') ?? []
  const rootRequests = requestsByFolder.get('__root__') ?? []

  // Root manifest
  const rootManifest = buildManifest(rootFolders, rootRequests)
  files[`${basePath}/${MANIFEST_FILE}`] = toYaml({ items: rootManifest })

  // Root level requests
  for (const request of rootRequests) {
    files[`${basePath}/${request.id}.yaml`] = serializeRequest(request, options)
  }

  // Folders and their contents (recursive)
  for (const folder of rootFolders) {
    serializeFolderRecursive(folder, basePath, files, foldersByParent, requestsByFolder, options, 0)
  }

  return files
}

function serializeFolderRecursive(
  folder: Folder,
  parentPath: string,
  files: Record<string, string>,
  foldersByParent: Map<string | null, Folder[]>,
  requestsByFolder: Map<string | null, Request[]>,
  options: SerializeOptions,
  depth: number,
): void {
  if (depth > 20) {
    throw new Error('Folder nesting depth exceeded maximum of 20 levels')
  }

  const folderPath = `${parentPath}/${folder.id}`

  // Folder metadata
  const folderMeta: Record<string, unknown> = {
    id: folder.id,
    name: folder.name,
  }

  const folderEnvIds = parseJsonArray<string>(folder.environment_ids)
  if (folderEnvIds && folderEnvIds.length > 0) {
    folderMeta.environment_ids = folderEnvIds
    folderMeta.default_environment_id = folder.default_environment_id

    const folderHints = buildEnvironmentHints(folderEnvIds)
    if (Object.keys(folderHints).length > 0) {
      folderMeta.environment_hints = folderHints
    }
  }

  files[`${folderPath}/${FOLDER_FILE}`] = toYaml(folderMeta)

  // Folder contents
  const childFolders = foldersByParent.get(folder.id) ?? []
  const childRequests = requestsByFolder.get(folder.id) ?? []

  // Folder manifest
  const manifest = buildManifest(childFolders, childRequests)
  files[`${folderPath}/${MANIFEST_FILE}`] = toYaml({ items: manifest })

  // Requests in this folder
  for (const request of childRequests) {
    files[`${folderPath}/${request.id}.yaml`] = serializeRequest(request, options)
  }

  // Nested folders
  for (const childFolder of childFolders) {
    serializeFolderRecursive(childFolder, folderPath, files, foldersByParent, requestsByFolder, options, depth + 1)
  }
}

function buildManifest(folders: Folder[], requests: Request[]): ManifestItem[] {
  const allItems: { type: 'folder' | 'request'; id: string; order: number }[] = []

  for (const folder of folders) {
    allItems.push({ type: 'folder', id: folder.id, order: folder.order })
  }
  for (const request of requests) {
    allItems.push({ type: 'request', id: request.id, order: request.order })
  }

  allItems.sort((a, b) => a.order - b.order)

  return allItems.map(({ type, id }) => ({ type, id }))
}

export function serializeRequest(request: Request, options: SerializeOptions = {}): string {
  let data: Record<string, unknown> = {
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: parseJsonArray(request.headers) ?? [],
    query_params: parseJsonArray(request.query_params) ?? [],
    body: request.body,
    body_type: request.body_type,
  }

  try {
    const scripts = request.scripts ? JSON.parse(request.scripts) : null
    if (scripts) data.scripts = scripts
  } catch { /* skip malformed scripts JSON */ }

  try {
    const auth = request.auth ? JSON.parse(request.auth) : null
    if (auth) data.auth = auth
  } catch { /* skip malformed auth JSON */ }

  // Strip local file references from form-data body
  if (request.body_type === 'form-data' && data.body) {
    data.body = stripFileReferences(data.body as string)
  }

  if (options.sanitize) {
    data = sanitizeRequestData(data)
  }

  return toYaml(data)
}

function stripFileReferences(bodyJson: string): string {
  try {
    const fields = JSON.parse(bodyJson) as Array<Record<string, string>>
    if (!Array.isArray(fields)) return bodyJson

    const cleaned = fields.map((field) => {
      if ((field.type ?? 'text') === 'file') {
        return { key: field.key ?? '', value: '', type: 'file', filename: field.filename ?? '' }
      }
      return { key: field.key ?? '', value: field.value ?? '', type: field.type ?? 'text' }
    })

    return JSON.stringify(cleaned)
  } catch {
    return bodyJson
  }
}

// --- Import ---

export function importFromDirectory(
  files: FileContent[],
  existingCollectionId?: string,
  workspaceId?: string,
): string {
  const db = getDatabase()

  // Organize files by path
  const filesByPath = new Map<string, string>()
  for (const file of files) {
    filesByPath.set(file.path, file.content)
  }

  // Find the collection file
  let collectionFileContent: string | undefined
  let basePath: string | undefined

  for (const [path, content] of filesByPath) {
    if (path.endsWith(`/${COLLECTION_FILE}`)) {
      collectionFileContent = content
      basePath = path.slice(0, path.lastIndexOf('/'))
      break
    }
  }

  if (!collectionFileContent || !basePath) {
    throw new Error('Collection file not found')
  }

  const collectionData = parseYaml(collectionFileContent)
  assertUuid(collectionData.id, 'collection')
  const environmentFields = validateEnvironmentIds(collectionData, workspaceId)

  const run = db.transaction(() => {
    const now = new Date().toISOString()

    if (existingCollectionId) {
      // Update existing collection
      db.prepare(`
        UPDATE collections SET
          name = ?, description = ?, variables = ?,
          environment_ids = ?, default_environment_id = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        collectionData.name as string,
        (collectionData.description as string) ?? null,
        JSON.stringify(collectionData.variables ?? []),
        environmentFields.environment_ids ? JSON.stringify(environmentFields.environment_ids) : null,
        environmentFields.default_environment_id,
        now,
        existingCollectionId,
      )

      // Remove existing folders and requests, then re-create
      db.prepare('DELETE FROM folders WHERE collection_id = ?').run(existingCollectionId)
      db.prepare('DELETE FROM requests WHERE collection_id = ?').run(existingCollectionId)
    } else {
      // Get next order
      const maxOrder = (db.prepare('SELECT COALESCE(MAX("order"), 0) as max_order FROM collections').get() as { max_order: number }).max_order

      db.prepare(`
        INSERT INTO collections (id, workspace_id, name, description, variables, environment_ids, default_environment_id, "order", sync_enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        collectionData.id as string,
        workspaceId ?? null,
        collectionData.name as string,
        (collectionData.description as string) ?? null,
        JSON.stringify(collectionData.variables ?? []),
        environmentFields.environment_ids ? JSON.stringify(environmentFields.environment_ids) : null,
        environmentFields.default_environment_id,
        maxOrder + 1,
        now,
        now,
      )
    }

    const collectionId = existingCollectionId ?? (collectionData.id as string)

    // Parse root manifest
    const rootManifestPath = `${basePath}/${MANIFEST_FILE}`
    const rootManifestContent = filesByPath.get(rootManifestPath)
    const rootManifest = rootManifestContent
      ? (parseYaml(rootManifestContent) as { items?: ManifestItem[] })
      : { items: [] }

    // Import items based on manifest ordering
    let order = 0
    for (const item of rootManifest.items ?? []) {
      if (item.type === 'request') {
        const requestPath = `${basePath}/${item.id}.yaml`
        const requestContent = filesByPath.get(requestPath)
        if (requestContent) {
          importRequest(parseYaml(requestContent), collectionId, null, order++)
        }
      } else if (item.type === 'folder') {
        const folderBasePath = `${basePath}/${item.id}`
        importFolderRecursive(folderBasePath, filesByPath, collectionId, null, order++, 0)
      }
    }

    return collectionId
  })

  return run()
}

function importFolderRecursive(
  folderBasePath: string,
  filesByPath: Map<string, string>,
  collectionId: string,
  parentId: string | null,
  order: number,
  depth: number,
): void {
  if (depth > 20) {
    throw new Error('Folder nesting depth exceeded maximum of 20 levels')
  }

  const folderFilePath = `${folderBasePath}/${FOLDER_FILE}`
  const folderContent = filesByPath.get(folderFilePath)
  if (!folderContent) return

  const folderData = parseYaml(folderContent)
  assertUuid(folderData.id, 'folder')
  const folderEnvFields = validateEnvironmentIds(folderData)
  const now = new Date().toISOString()
  const db = getDatabase()

  db.prepare(`
    INSERT INTO folders (id, collection_id, parent_id, name, "order", environment_ids, default_environment_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    folderData.id as string,
    collectionId,
    parentId,
    folderData.name as string,
    order,
    folderEnvFields.environment_ids ? JSON.stringify(folderEnvFields.environment_ids) : null,
    folderEnvFields.default_environment_id,
    now,
    now,
  )

  const folderId = folderData.id as string

  // Parse folder manifest
  const manifestPath = `${folderBasePath}/${MANIFEST_FILE}`
  const manifestContent = filesByPath.get(manifestPath)
  const manifest = manifestContent
    ? (parseYaml(manifestContent) as { items?: ManifestItem[] })
    : { items: [] }

  // Import items based on manifest ordering
  let childOrder = 0
  for (const item of manifest.items ?? []) {
    if (item.type === 'request') {
      const requestPath = `${folderBasePath}/${item.id}.yaml`
      const requestContent = filesByPath.get(requestPath)
      if (requestContent) {
        importRequest(parseYaml(requestContent), collectionId, folderId, childOrder++)
      }
    } else if (item.type === 'folder') {
      const childFolderPath = `${folderBasePath}/${item.id}`
      importFolderRecursive(childFolderPath, filesByPath, collectionId, folderId, childOrder++, depth + 1)
    }
  }
}

function importRequest(
  data: Record<string, unknown>,
  collectionId: string,
  folderId: string | null,
  order: number,
): void {
  assertUuid(data.id, 'request')
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO requests (id, collection_id, folder_id, name, method, url, headers, query_params, body, body_type, scripts, auth, "order", created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id as string,
    collectionId,
    folderId,
    data.name as string,
    (data.method as string) ?? 'GET',
    (data.url as string) ?? '',
    JSON.stringify(data.headers ?? []),
    JSON.stringify(data.query_params ?? []),
    data.body != null ? (typeof data.body === 'string' ? data.body : JSON.stringify(data.body)) : null,
    (data.body_type as string) ?? 'none',
    data.scripts ? JSON.stringify(data.scripts) : null,
    data.auth ? JSON.stringify(data.auth) : null,
    order,
    now,
    now,
  )
}

// --- Environment helpers ---

function buildEnvironmentHints(environmentIds: string[] | null): Record<string, { vault_path: string }> {
  if (!environmentIds || environmentIds.length === 0) return {}

  const db = getDatabase()
  const placeholders = environmentIds.map(() => '?').join(',')
  const envs = db
    .prepare(`SELECT id, vault_path FROM environments WHERE id IN (${placeholders}) AND vault_synced = 1`)
    .all(...environmentIds) as Array<{ id: string; vault_path: string | null }>

  const hints: Record<string, { vault_path: string }> = {}
  for (const env of envs) {
    if (env.vault_path) {
      hints[env.id] = { vault_path: env.vault_path }
    }
  }

  return hints
}

function validateEnvironmentIds(
  data: Record<string, unknown>,
  workspaceId?: string,
): { environment_ids: string[] | null; default_environment_id: string | null } {
  let remoteIds: string[]
  const rawIds = data.environment_ids
  if (Array.isArray(rawIds)) {
    remoteIds = rawIds as string[]
  } else if (typeof rawIds === 'string') {
    try {
      const parsed = JSON.parse(rawIds)
      remoteIds = Array.isArray(parsed) ? parsed : []
    } catch {
      remoteIds = rawIds ? [rawIds] : []
    }
  } else {
    remoteIds = []
  }
  const defaultId = (data.default_environment_id ?? null) as string | null

  if (!remoteIds || remoteIds.length === 0) {
    return { environment_ids: null, default_environment_id: null }
  }

  const db = getDatabase()

  // First pass: direct UUID lookup
  const placeholders = remoteIds.map(() => '?').join(',')
  const existingRows = db
    .prepare(`SELECT id FROM environments WHERE id IN (${placeholders})`)
    .all(...remoteIds) as Array<{ id: string }>
  const existingIds = existingRows.map((r) => r.id)
  const unmatchedIds = remoteIds.filter((id) => !existingIds.includes(id))

  // Second pass: resolve unmatched IDs via vault_path hints
  const idMapping: Record<string, string> = {}
  const hints = (data.environment_hints ?? {}) as Record<string, { vault_path: string }>

  if (unmatchedIds.length > 0 && Object.keys(hints).length > 0) {
    const hintPaths: Record<string, string> = {}
    for (const remoteId of unmatchedIds) {
      if (hints[remoteId]?.vault_path) {
        hintPaths[hints[remoteId].vault_path] = remoteId
      }
    }

    if (Object.keys(hintPaths).length > 0 && workspaceId) {
      const localVaultEnvs = db
        .prepare('SELECT id, vault_path FROM environments WHERE workspace_id = ? AND vault_synced = 1')
        .all(workspaceId) as Array<{ id: string; vault_path: string | null }>

      for (const localEnv of localVaultEnvs) {
        if (localEnv.vault_path && hintPaths[localEnv.vault_path]) {
          const remoteId = hintPaths[localEnv.vault_path]
          idMapping[remoteId] = localEnv.id
          existingIds.push(localEnv.id)
          delete hintPaths[localEnv.vault_path]
        }
      }
    }
  }

  // Resolve default_environment_id through the mapping
  let resolvedDefaultId = defaultId
  if (defaultId && idMapping[defaultId]) {
    resolvedDefaultId = idMapping[defaultId]
  }

  return {
    environment_ids: existingIds.length > 0 ? existingIds : null,
    default_environment_id: resolvedDefaultId && existingIds.includes(resolvedDefaultId) ? resolvedDefaultId : null,
  }
}

// --- JSON helpers ---

function parseJsonArray<T>(jsonStr: string | null): T[] | null {
  if (!jsonStr) return null
  try {
    const parsed = JSON.parse(jsonStr)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
