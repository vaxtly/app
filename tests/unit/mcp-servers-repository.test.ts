import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import * as mcpServersRepo from '../../src/main/database/repositories/mcp-servers'

beforeEach(() => {
  openTestDatabase()
})

afterEach(() => {
  closeDatabase()
})

describe('mcp-servers repository', () => {
  function createWorkspace(): string {
    const ws = workspacesRepo.create({ name: 'Test Workspace' })
    return ws.id
  }

  it('creates and retrieves a server', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({
      workspace_id: wsId,
      name: 'Test Server',
      transport_type: 'stdio',
      command: 'npx',
      args: JSON.stringify(['-y', '@modelcontextprotocol/server-echo']),
    })

    expect(server.id).toBeDefined()
    expect(server.name).toBe('Test Server')
    expect(server.transport_type).toBe('stdio')
    expect(server.command).toBe('npx')
    expect(server.workspace_id).toBe(wsId)

    const found = mcpServersRepo.findById(server.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Test Server')
  })

  it('lists servers by workspace', () => {
    const wsId = createWorkspace()
    mcpServersRepo.create({ workspace_id: wsId, name: 'Server A' })
    mcpServersRepo.create({ workspace_id: wsId, name: 'Server B' })

    const servers = mcpServersRepo.findByWorkspace(wsId)
    expect(servers).toHaveLength(2)
    expect(servers[0].name).toBe('Server A')
    expect(servers[1].name).toBe('Server B')
  })

  it('does not return servers from other workspaces', () => {
    const ws1 = createWorkspace()
    const ws2 = workspacesRepo.create({ name: 'Other Workspace' }).id

    mcpServersRepo.create({ workspace_id: ws1, name: 'WS1 Server' })
    mcpServersRepo.create({ workspace_id: ws2, name: 'WS2 Server' })

    const ws1Servers = mcpServersRepo.findByWorkspace(ws1)
    expect(ws1Servers).toHaveLength(1)
    expect(ws1Servers[0].name).toBe('WS1 Server')
  })

  it('cascades on workspace delete', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({ workspace_id: wsId, name: 'Cascade Test' })

    workspacesRepo.remove(wsId)

    const found = mcpServersRepo.findById(server.id)
    expect(found).toBeUndefined()
  })

  it('updates a server', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({ workspace_id: wsId, name: 'Before' })

    const updated = mcpServersRepo.update(server.id, {
      name: 'After',
      transport_type: 'streamable-http',
      url: 'http://localhost:3000/mcp',
      command: null,
    })

    expect(updated).toBeDefined()
    expect(updated!.name).toBe('After')
    expect(updated!.transport_type).toBe('streamable-http')
    expect(updated!.url).toBe('http://localhost:3000/mcp')
    expect(updated!.command).toBeNull()
  })

  it('returns undefined when updating nonexistent server', () => {
    const result = mcpServersRepo.update('nonexistent', { name: 'Nope' })
    expect(result).toBeUndefined()
  })

  it('deletes a server', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({ workspace_id: wsId, name: 'Delete Me' })

    expect(mcpServersRepo.remove(server.id)).toBe(true)
    expect(mcpServersRepo.findById(server.id)).toBeUndefined()
  })

  it('returns false when deleting nonexistent server', () => {
    expect(mcpServersRepo.remove('nonexistent')).toBe(false)
  })

  it('reorders servers', () => {
    const wsId = createWorkspace()
    const a = mcpServersRepo.create({ workspace_id: wsId, name: 'A' })
    const b = mcpServersRepo.create({ workspace_id: wsId, name: 'B' })
    const c = mcpServersRepo.create({ workspace_id: wsId, name: 'C' })

    mcpServersRepo.reorder([c.id, a.id, b.id])

    const servers = mcpServersRepo.findByWorkspace(wsId)
    expect(servers[0].name).toBe('C')
    expect(servers[1].name).toBe('A')
    expect(servers[2].name).toBe('B')
  })

  it('auto-increments order on create', () => {
    const wsId = createWorkspace()
    const a = mcpServersRepo.create({ workspace_id: wsId, name: 'A' })
    const b = mcpServersRepo.create({ workspace_id: wsId, name: 'B' })

    expect(a.order).toBe(1)
    expect(b.order).toBe(2)
  })

  it('stores HTTP transport config', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({
      workspace_id: wsId,
      name: 'HTTP Server',
      transport_type: 'streamable-http',
      url: 'http://localhost:8080/mcp',
      headers: JSON.stringify({ Authorization: 'Bearer token123' }),
    })

    expect(server.transport_type).toBe('streamable-http')
    expect(server.url).toBe('http://localhost:8080/mcp')
    expect(server.headers).toBe(JSON.stringify({ Authorization: 'Bearer token123' }))
    expect(server.command).toBeNull()
  })
})
