import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Capture IPC handlers via fake ipcMain
const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Function) => { handlers.set(ch, fn) } },
  BrowserWindow: { getAllWindows: () => [] },
}))

// Mock the sync service entirely
vi.mock('../../src/main/sync/remote-sync-service', () => ({
  testConnection: vi.fn(),
  pull: vi.fn(),
  pushCollection: vi.fn(),
  pushAll: vi.fn(),
  forceKeepLocal: vi.fn(),
  forceKeepRemote: vi.fn(),
  deleteRemoteCollection: vi.fn(),
  pushSingleRequest: vi.fn(),
  pullSingleCollection: vi.fn(),
  SyncConflictError: class SyncConflictError extends Error {
    constructor(msg: string) { super(msg); this.name = 'SyncConflictError' }
  },
}))

// Mock sensitive-data-scanner
vi.mock('../../src/main/services/sensitive-data-scanner', () => ({
  scanCollection: vi.fn().mockReturnValue([]),
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import { registerSyncHandlers } from '../../src/main/ipc/sync'
import * as syncService from '../../src/main/sync/remote-sync-service'
import { scanCollection } from '../../src/main/services/sensitive-data-scanner'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as requestsRepo from '../../src/main/database/repositories/requests'

beforeEach(() => {
  handlers.clear()
  openTestDatabase()
  initEncryptionForTesting()
  registerSyncHandlers()
  vi.clearAllMocks()
})
afterEach(() => closeDatabase())

function invoke(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for ${channel}`)
  return handler(null, ...args)
}

describe('sync:test-connection', () => {
  it('passes workspaceId and returns boolean', async () => {
    vi.mocked(syncService.testConnection).mockResolvedValue(true)
    const result = await invoke('sync:test-connection', 'ws-1')
    expect(syncService.testConnection).toHaveBeenCalledWith('ws-1')
    expect(result).toBe(true)
  })

  it('returns false when connection fails', async () => {
    vi.mocked(syncService.testConnection).mockResolvedValue(false)
    const result = await invoke('sync:test-connection')
    expect(result).toBe(false)
  })
})

describe('sync:pull', () => {
  it('returns SyncResult from service', async () => {
    const expected = { success: true, message: 'OK', pulled: 2, pushed: 0 }
    vi.mocked(syncService.pull).mockResolvedValue(expected)
    const result = await invoke('sync:pull', 'ws-1')
    expect(syncService.pull).toHaveBeenCalledWith('ws-1')
    expect(result).toEqual(expected)
  })

  it('passes undefined workspaceId', async () => {
    vi.mocked(syncService.pull).mockResolvedValue({ success: true, message: 'OK', pulled: 0, pushed: 0 })
    await invoke('sync:pull')
    expect(syncService.pull).toHaveBeenCalledWith(undefined)
  })
})

describe('sync:push-collection', () => {
  it('returns not found when collection missing', async () => {
    const result = await invoke('sync:push-collection', 'nonexistent')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Collection not found')
  })

  it('pushes collection and returns pushed:1', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.pushCollection).mockResolvedValue(undefined)
    const result = await invoke('sync:push-collection', col.id, false, 'ws-1')
    expect(syncService.pushCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: col.id }),
      false,
      'ws-1',
    )
    expect(result).toEqual({ success: true, message: 'Pushed successfully', pulled: 0, pushed: 1 })
  })

  it('passes sanitize flag through', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.pushCollection).mockResolvedValue(undefined)
    await invoke('sync:push-collection', col.id, true)
    expect(syncService.pushCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: col.id }),
      true,
      undefined,
    )
  })

  it('returns conflict result on SyncConflictError', async () => {
    const col = collectionsRepo.create({ name: 'My Col' })
    vi.mocked(syncService.pushCollection).mockRejectedValue(new syncService.SyncConflictError('conflict'))
    const result = await invoke('sync:push-collection', col.id)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Conflict detected')
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].collectionId).toBe(col.id)
    expect(result.conflicts[0].collectionName).toBe('My Col')
  })

  it('returns generic error message on other errors', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.pushCollection).mockRejectedValue(new Error('Network timeout'))
    const result = await invoke('sync:push-collection', col.id)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Network timeout')
  })
})

describe('sync:push-all', () => {
  it('delegates to syncService.pushAll', async () => {
    const expected = { success: true, message: 'Pushed 3', pulled: 0, pushed: 3 }
    vi.mocked(syncService.pushAll).mockResolvedValue(expected)
    const result = await invoke('sync:push-all', 'ws-1')
    expect(syncService.pushAll).toHaveBeenCalledWith('ws-1')
    expect(result).toEqual(expected)
  })
})

describe('sync:resolve-conflict', () => {
  it('rejects invalid resolution string', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const result = await invoke('sync:resolve-conflict', col.id, 'invalid-strategy')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Invalid resolution strategy')
  })

  it('returns not found when collection missing', async () => {
    const result = await invoke('sync:resolve-conflict', 'nonexistent', 'keep-local')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Collection not found')
  })

  it('calls forceKeepLocal for keep-local resolution', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.forceKeepLocal).mockResolvedValue(undefined)
    const result = await invoke('sync:resolve-conflict', col.id, 'keep-local', 'ws-1')
    expect(syncService.forceKeepLocal).toHaveBeenCalledWith(
      expect.objectContaining({ id: col.id }),
      'ws-1',
    )
    expect(result.success).toBe(true)
    expect(result.message).toContain('keep-local')
  })

  it('calls forceKeepRemote for keep-remote resolution', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.forceKeepRemote).mockResolvedValue(undefined)
    const result = await invoke('sync:resolve-conflict', col.id, 'keep-remote')
    expect(syncService.forceKeepRemote).toHaveBeenCalledWith(
      expect.objectContaining({ id: col.id }),
      undefined,
    )
    expect(result.success).toBe(true)
  })
})

describe('sync:delete-remote', () => {
  it('returns not found when collection missing', async () => {
    const result = await invoke('sync:delete-remote', 'nonexistent')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Collection not found')
  })

  it('deletes remote and returns success', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.deleteRemoteCollection).mockResolvedValue(undefined)
    const result = await invoke('sync:delete-remote', col.id)
    expect(syncService.deleteRemoteCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: col.id }),
      undefined,
    )
    expect(result.success).toBe(true)
    expect(result.message).toBe('Deleted from remote')
  })

  it('returns error on failure', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.deleteRemoteCollection).mockRejectedValue(new Error('API error'))
    const result = await invoke('sync:delete-remote', col.id)
    expect(result.success).toBe(false)
    expect(result.message).toBe('API error')
  })
})

describe('sync:scan-sensitive', () => {
  it('returns empty array when collection not found', async () => {
    const result = await invoke('sync:scan-sensitive', 'nonexistent')
    expect(result).toEqual([])
  })

  it('parses request data and calls scanCollection', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({
      collection_id: col.id,
      name: 'R1',
      url: 'https://api.test',
      headers: JSON.stringify([{ key: 'Authorization', value: 'Bearer tok', enabled: true }]),
    })

    vi.mocked(scanCollection).mockReturnValue([
      { requestId: req.id, requestName: 'R1', location: 'header', field: 'Authorization', value: 'Bearer tok', pattern: 'bearer_token' },
    ])

    const result = await invoke('sync:scan-sensitive', col.id)
    expect(scanCollection).toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].requestName).toBe('R1')
  })
})

describe('sync:push-request', () => {
  it('returns false when collection not found', async () => {
    const result = await invoke('sync:push-request', 'nonexistent', 'req-id')
    expect(result).toBe(false)
  })

  it('calls pushSingleRequest with correct arguments', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.pushSingleRequest).mockResolvedValue(true)
    const result = await invoke('sync:push-request', col.id, 'req-123', true, 'ws-1')
    expect(syncService.pushSingleRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: col.id }),
      'req-123',
      true,
      'ws-1',
    )
    expect(result).toBe(true)
  })
})

describe('sync:pull-collection', () => {
  it('returns not found when collection missing', async () => {
    const result = await invoke('sync:pull-collection', 'nonexistent')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Collection not found')
  })

  it('returns "Pulled successfully" when updated', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.pullSingleCollection).mockResolvedValue(true)
    const result = await invoke('sync:pull-collection', col.id)
    expect(result.success).toBe(true)
    expect(result.message).toBe('Pulled successfully')
    expect(result.pulled).toBe(1)
  })

  it('returns "Already up to date" when not updated', async () => {
    const col = collectionsRepo.create({ name: 'Test' })
    vi.mocked(syncService.pullSingleCollection).mockResolvedValue(false)
    const result = await invoke('sync:pull-collection', col.id)
    expect(result.success).toBe(true)
    expect(result.message).toBe('Already up to date')
    expect(result.pulled).toBe(0)
  })

  it('returns conflict result on SyncConflictError', async () => {
    const col = collectionsRepo.create({ name: 'MyCol' })
    vi.mocked(syncService.pullSingleCollection).mockRejectedValue(new syncService.SyncConflictError('conflict'))
    const result = await invoke('sync:pull-collection', col.id)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Conflict detected')
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].collectionName).toBe('MyCol')
  })
})
