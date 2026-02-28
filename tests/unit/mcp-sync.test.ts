import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as mcpServersRepo from '../../src/main/database/repositories/mcp-servers'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => closeDatabase())

function createWorkspace(): string {
  return workspacesRepo.create({ name: 'Test Workspace' }).id
}

describe('mcp-servers repository — sync fields', () => {
  it('creates server with sync defaults', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({
      workspace_id: wsId,
      name: 'Test Server',
    })

    expect(server.sync_enabled).toBe(0)
    expect(server.is_dirty).toBe(0)
    expect(server.remote_sha).toBeNull()
    expect(server.remote_synced_at).toBeNull()
    expect(server.file_shas).toBeNull()
  })

  it('markDirty sets is_dirty = 1', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({
      workspace_id: wsId,
      name: 'Test Server',
    })

    mcpServersRepo.markDirty(server.id)

    const updated = mcpServersRepo.findById(server.id)
    expect(updated!.is_dirty).toBe(1)
  })

  it('update preserves sync fields', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({
      workspace_id: wsId,
      name: 'Test Server',
    })

    mcpServersRepo.update(server.id, {
      sync_enabled: 1,
      remote_sha: 'abc123',
      remote_synced_at: '2024-01-01T00:00:00Z',
      file_shas: '{"test": "state"}',
    })

    const updated = mcpServersRepo.findById(server.id)
    expect(updated!.sync_enabled).toBe(1)
    expect(updated!.remote_sha).toBe('abc123')
    expect(updated!.remote_synced_at).toBe('2024-01-01T00:00:00Z')
    expect(updated!.file_shas).toBe('{"test": "state"}')
  })

  it('findDirtyOrNew returns servers needing push', () => {
    const wsId = createWorkspace()

    // Sync enabled + dirty
    const s1 = mcpServersRepo.create({ workspace_id: wsId, name: 'Dirty' })
    mcpServersRepo.update(s1.id, { sync_enabled: 1 })
    mcpServersRepo.markDirty(s1.id)

    // Sync enabled + no remote_sha (new)
    const s2 = mcpServersRepo.create({ workspace_id: wsId, name: 'New' })
    mcpServersRepo.update(s2.id, { sync_enabled: 1 })

    // Sync enabled + clean (should NOT be returned)
    const s3 = mcpServersRepo.create({ workspace_id: wsId, name: 'Clean' })
    mcpServersRepo.update(s3.id, { sync_enabled: 1, remote_sha: 'sha', is_dirty: 0 })

    // Sync disabled (should NOT be returned)
    const s4 = mcpServersRepo.create({ workspace_id: wsId, name: 'Disabled' })
    mcpServersRepo.markDirty(s4.id)

    const result = mcpServersRepo.findDirtyOrNew(wsId)
    const ids = result.map((s) => s.id)

    expect(ids).toContain(s1.id)
    expect(ids).toContain(s2.id)
    expect(ids).not.toContain(s3.id)
    expect(ids).not.toContain(s4.id)
  })

  it('findSyncEnabled returns all sync-enabled servers', () => {
    const wsId = createWorkspace()

    const s1 = mcpServersRepo.create({ workspace_id: wsId, name: 'Enabled 1' })
    mcpServersRepo.update(s1.id, { sync_enabled: 1 })

    const s2 = mcpServersRepo.create({ workspace_id: wsId, name: 'Enabled 2' })
    mcpServersRepo.update(s2.id, { sync_enabled: 1 })

    mcpServersRepo.create({ workspace_id: wsId, name: 'Disabled' })

    const result = mcpServersRepo.findSyncEnabled(wsId)
    expect(result).toHaveLength(2)
  })
})
