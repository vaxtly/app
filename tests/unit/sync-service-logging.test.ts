/**
 * Tests for sync service logging, conflict detection, and force-pull behavior.
 * These test the actual service functions (pullSingleCollection, pushSingleRequest)
 * with mocked git providers and a real in-memory database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock electron (needed by session-log)
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

// Hoist mock provider so it can be referenced in vi.mock factories
const { mockProviderInstance } = vi.hoisted(() => {
  const instance = {
    listFiles: vi.fn().mockResolvedValue([]),
    listDirectoryRecursive: vi.fn().mockResolvedValue([]),
    getDirectoryTree: vi.fn().mockResolvedValue([]),
    getFile: vi.fn().mockResolvedValue(null),
    createFile: vi.fn().mockResolvedValue('new-sha'),
    updateFile: vi.fn().mockResolvedValue('updated-sha'),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    commitMultipleFiles: vi.fn().mockResolvedValue('commit-sha'),
    testConnection: vi.fn().mockResolvedValue(true),
  }
  return { mockProviderInstance: instance }
})

// Mock provider constructors to return our mock instance.
// Must use function (not arrow) so `new` works.
vi.mock('../../src/main/sync/github-provider', () => ({
  GitHubProvider: function GitHubProvider() { Object.assign(this, mockProviderInstance) },
}))
vi.mock('../../src/main/sync/gitlab-provider', () => ({
  GitLabProvider: function GitLabProvider() { Object.assign(this, mockProviderInstance) },
}))

// Mock the yaml-serializer to avoid complex serialization dependencies
vi.mock('../../src/main/services/yaml-serializer', () => ({
  serializeToDirectory: vi.fn().mockReturnValue({}),
  serializeRequest: vi.fn().mockReturnValue('method: GET\nurl: https://example.com'),
  importFromDirectory: vi.fn().mockReturnValue('imported-id'),
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import { getLogs, clearLogs } from '../../src/main/services/session-log'
import {
  pullSingleCollection,
  pushSingleRequest,
} from '../../src/main/sync/remote-sync-service'
import type { DirectoryItem } from '../../src/main/sync/git-provider.interface'
import type { FileContent } from '../../src/shared/types/sync'

/** Set up sync settings so getProvider() returns a GitHub provider (mocked) */
function configureSyncSettings(): void {
  settingsRepo.setSetting('sync.provider', 'github')
  settingsRepo.setSetting('sync.repository', 'user/repo')
  settingsRepo.setSetting('sync.token', 'ghp_test')
}

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
  clearLogs()
  configureSyncSettings()

  // Reset all mock provider methods
  for (const fn of Object.values(mockProviderInstance)) {
    if (typeof fn === 'function' && 'mockClear' in fn) {
      (fn as ReturnType<typeof vi.fn>).mockClear()
    }
  }
  // Restore defaults
  mockProviderInstance.listDirectoryRecursive.mockResolvedValue([])
  mockProviderInstance.getDirectoryTree.mockResolvedValue([])
  mockProviderInstance.createFile.mockResolvedValue('new-sha')
  mockProviderInstance.updateFile.mockResolvedValue('updated-sha')
})

afterEach(() => {
  closeDatabase()
})

describe('pullSingleCollection logging', () => {
  it('logs "No remote data found" when remote directory is empty', async () => {
    const col = collectionsRepo.create({ name: 'TestCol' })
    mockProviderInstance.listDirectoryRecursive.mockResolvedValue([])

    const result = await pullSingleCollection(col, undefined)
    expect(result).toBe(false)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].category).toBe('sync')
    expect(logs[0].type).toBe('pull')
    expect(logs[0].target).toBe('TestCol')
    expect(logs[0].message).toBe('No remote data found')
  })

  it('logs "Already up to date" when no remote changes detected', async () => {
    const col = collectionsRepo.create({ name: 'UpToDate' })
    collectionsRepo.update(col.id, {
      file_shas: JSON.stringify({
        [`collections/${col.id}/_collection.yaml`]: {
          content_hash: 'abc',
          remote_sha: 'sha-same',
          commit_sha: null,
        },
      }),
    })

    const remoteItems: DirectoryItem[] = [
      { type: 'file', path: `collections/${col.id}/_collection.yaml`, sha: 'sha-same' },
    ]
    mockProviderInstance.listDirectoryRecursive.mockResolvedValue(remoteItems)

    const freshCol = collectionsRepo.findById(col.id)!
    const result = await pullSingleCollection(freshCol, undefined)
    expect(result).toBe(false)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toBe('Already up to date')
  })

  it('force-pulls when collection is dirty (no conflict check)', async () => {
    const col = collectionsRepo.create({ name: 'DirtyCol' })
    collectionsRepo.update(col.id, {
      is_dirty: 1,
      file_shas: JSON.stringify({
        [`collections/${col.id}/_collection.yaml`]: {
          content_hash: 'old-hash',
          remote_sha: 'old-sha',
          commit_sha: null,
        },
      }),
    })

    const remoteItems: DirectoryItem[] = [
      { type: 'file', path: `collections/${col.id}/_collection.yaml`, sha: 'new-sha' },
    ]
    const remoteFiles: FileContent[] = [
      { path: `collections/${col.id}/_collection.yaml`, content: 'name: DirtyCol', sha: 'new-sha' },
    ]

    mockProviderInstance.listDirectoryRecursive.mockResolvedValue(remoteItems)
    mockProviderInstance.getDirectoryTree.mockResolvedValue(remoteFiles)

    const freshCol = collectionsRepo.findById(col.id)!
    const result = await pullSingleCollection(freshCol, undefined)

    // Should have pulled successfully despite is_dirty=1
    expect(result).toBe(true)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toBe('Pulled from remote successfully')
    expect(logs[0].success).toBe(true)

    // Collection should no longer be dirty
    const updatedCol = collectionsRepo.findById(col.id)!
    expect(updatedCol.is_dirty).toBe(0)
  })

  it('logs success after pulling updated remote content', async () => {
    const col = collectionsRepo.create({ name: 'PullMe' })
    collectionsRepo.update(col.id, {
      file_shas: JSON.stringify({
        [`collections/${col.id}/_collection.yaml`]: {
          content_hash: 'old-hash',
          remote_sha: 'old-sha',
          commit_sha: null,
        },
      }),
    })

    const remoteItems: DirectoryItem[] = [
      { type: 'file', path: `collections/${col.id}/_collection.yaml`, sha: 'changed-sha' },
    ]
    const remoteFiles: FileContent[] = [
      { path: `collections/${col.id}/_collection.yaml`, content: 'name: PullMe\nvariables: []', sha: 'changed-sha' },
    ]

    mockProviderInstance.listDirectoryRecursive.mockResolvedValue(remoteItems)
    mockProviderInstance.getDirectoryTree.mockResolvedValue(remoteFiles)

    const freshCol = collectionsRepo.findById(col.id)!
    const result = await pullSingleCollection(freshCol, undefined)
    expect(result).toBe(true)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].category).toBe('sync')
    expect(logs[0].type).toBe('pull')
    expect(logs[0].target).toBe('PullMe')
    expect(logs[0].message).toBe('Pulled from remote successfully')
    expect(logs[0].success).toBe(true)
  })

  it('throws when provider is not configured', async () => {
    // Clear sync settings
    const col = collectionsRepo.create({ name: 'NoProv' })
    settingsRepo.removeSetting('sync.provider')
    settingsRepo.removeSetting('sync.repository')
    settingsRepo.removeSetting('sync.token')
    await expect(pullSingleCollection(col, undefined)).rejects.toThrow('Remote not configured')
  })
})

describe('pushSingleRequest logging', () => {
  it('logs conflict on 409 status code', async () => {
    const col = collectionsRepo.create({ name: 'ConflictCol' })
    const req = requestsRepo.create({
      collection_id: col.id,
      name: 'R1',
      url: 'https://api.test',
    })

    const error = new Error('Conflict') as Error & { statusCode: number }
    error.statusCode = 409
    mockProviderInstance.createFile.mockRejectedValue(error)

    const result = await pushSingleRequest(col, req.id, false, undefined)
    expect(result).toBe(false)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].category).toBe('sync')
    expect(logs[0].type).toBe('push')
    expect(logs[0].target).toBe('ConflictCol')
    expect(logs[0].message).toContain('Conflict on single-file push')
    expect(logs[0].success).toBe(false)
  })

  it('logs conflict on 400 status code (GitLab)', async () => {
    const col = collectionsRepo.create({ name: 'GLConflict' })
    const req = requestsRepo.create({
      collection_id: col.id,
      name: 'R2',
      url: 'https://api.test',
    })

    const error = new Error('Bad request') as Error & { statusCode: number }
    error.statusCode = 400
    mockProviderInstance.createFile.mockRejectedValue(error)

    const result = await pushSingleRequest(col, req.id, false, undefined)
    expect(result).toBe(false)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toContain('Conflict on single-file push')
    expect(logs[0].success).toBe(false)
  })

  it('logs generic failure on non-conflict errors', async () => {
    const col = collectionsRepo.create({ name: 'ErrorCol' })
    const req = requestsRepo.create({
      collection_id: col.id,
      name: 'R3',
      url: 'https://api.test',
    })

    mockProviderInstance.createFile.mockRejectedValue(new Error('Network timeout'))

    const result = await pushSingleRequest(col, req.id, false, undefined)
    expect(result).toBe(false)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toContain('Push failed: Network timeout')
    expect(logs[0].success).toBe(false)
  })

  it('marks collection dirty on push failure', async () => {
    const col = collectionsRepo.create({ name: 'DirtyAfterFail' })
    const req = requestsRepo.create({
      collection_id: col.id,
      name: 'R4',
      url: 'https://api.test',
    })

    mockProviderInstance.createFile.mockRejectedValue(new Error('Server error'))

    await pushSingleRequest(col, req.id, false, undefined)

    const updated = collectionsRepo.findById(col.id)!
    expect(updated.is_dirty).toBe(1)
  })

  it('logs success after pushing a request', async () => {
    const col = collectionsRepo.create({ name: 'PushOK' })
    const req = requestsRepo.create({
      collection_id: col.id,
      name: 'MyReq',
      url: 'https://api.test',
    })

    mockProviderInstance.createFile.mockResolvedValue('new-sha-123')

    const result = await pushSingleRequest(col, req.id, false, undefined)
    expect(result).toBe(true)

    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].category).toBe('sync')
    expect(logs[0].type).toBe('push')
    expect(logs[0].target).toBe('MyReq')
    expect(logs[0].message).toContain('Pushed to PushOK')
    expect(logs[0].success).toBe(true)
  })

  it('returns false when request not found', async () => {
    const col = collectionsRepo.create({ name: 'NoReq' })
    const result = await pushSingleRequest(col, 'nonexistent-req', false, undefined)
    expect(result).toBe(false)
  })

  it('returns false when provider is not configured', async () => {
    const col = collectionsRepo.create({ name: 'NoProv' })
    settingsRepo.removeSetting('sync.provider')
    settingsRepo.removeSetting('sync.repository')
    settingsRepo.removeSetting('sync.token')
    const result = await pushSingleRequest(col, 'req-id', false, undefined)
    expect(result).toBe(false)
  })
})
