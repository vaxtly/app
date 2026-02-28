import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Electron's BrowserWindow before importing the service
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

// Mock the MCP SDK
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockClose = vi.fn().mockResolvedValue(undefined)
const mockListTools = vi.fn().mockResolvedValue({ tools: [{ name: 'test-tool', description: 'A test tool', inputSchema: {} }] })
const mockCallTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }], isError: false })
const mockListResources = vi.fn().mockResolvedValue({ resources: [] })
const mockReadResource = vi.fn().mockResolvedValue({ contents: [{ uri: 'test://resource', text: 'content' }] })
const mockListResourceTemplates = vi.fn().mockResolvedValue({ resourceTemplates: [] })
const mockListPrompts = vi.fn().mockResolvedValue({ prompts: [] })
const mockGetPrompt = vi.fn().mockResolvedValue({ messages: [] })
const mockSetNotificationHandler = vi.fn()
const mockGetServerVersion = vi.fn(() => ({ name: 'test-server', version: '1.0.0', protocolVersion: '2025-03-26' }))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockConnect
    close = mockClose
    listTools = mockListTools
    callTool = mockCallTool
    listResources = mockListResources
    readResource = mockReadResource
    listResourceTemplates = mockListResourceTemplates
    listPrompts = mockListPrompts
    getPrompt = mockGetPrompt
    setNotificationHandler = mockSetNotificationHandler
    getServerVersion = mockGetServerVersion
    fallbackNotificationHandler: null | ((...args: unknown[]) => unknown) = null
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockStdio {},
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class MockHTTP {},
}))

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class MockSSE {},
}))

// Mock variable substitution (passes through by default)
const mockSubstitute = vi.fn((text: string) => text)
vi.mock('../../src/main/services/variable-substitution', () => ({
  substitute: (...args: unknown[]) => mockSubstitute(...args),
}))

// Mock vault sync
vi.mock('../../src/main/vault/vault-sync-service', () => ({
  ensureLoaded: vi.fn().mockResolvedValue(undefined),
}))

// Mock environments repo
vi.mock('../../src/main/database/repositories/environments', () => ({
  findActive: vi.fn().mockReturnValue(undefined),
}))

import * as mcpClient from '../../src/main/services/mcp-client'
import type { McpServer } from '../../src/shared/types/mcp'

function makeServer(overrides?: Partial<McpServer>): McpServer {
  return {
    id: 'test-server-id',
    workspace_id: 'ws-1',
    name: 'Test Server',
    transport_type: 'stdio',
    command: 'node',
    args: JSON.stringify(['server.js']),
    env: null,
    cwd: null,
    url: null,
    headers: null,
    order: 0,
    sync_enabled: 0,
    is_dirty: 0,
    remote_sha: null,
    remote_synced_at: null,
    file_shas: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  // Disconnect all connections from previous tests first
  await mcpClient.disconnectAll()
  // Then clear mocks so counts start fresh
  vi.clearAllMocks()
})

describe('mcp-client service', () => {
  it('connects to a stdio server', async () => {
    const server = makeServer()
    const state = await mcpClient.connect(server)

    expect(state.status).toBe('connected')
    expect(state.serverId).toBe('test-server-id')
    expect(state.serverInfo?.name).toBe('test-server')
    expect(state.tools).toHaveLength(1)
    expect(state.tools[0].name).toBe('test-tool')
    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('disconnects from a server', async () => {
    const server = makeServer()
    await mcpClient.connect(server)

    await mcpClient.disconnect(server.id)

    expect(mockClose).toHaveBeenCalledOnce()
    expect(mcpClient.getConnectionState(server.id)).toBeNull()
  })

  it('disconnects all servers', async () => {
    const server1 = makeServer({ id: 'server-1' })
    const server2 = makeServer({ id: 'server-2' })

    await mcpClient.connect(server1)
    await mcpClient.connect(server2)

    await mcpClient.disconnectAll()

    expect(mcpClient.getConnectionState('server-1')).toBeNull()
    expect(mcpClient.getConnectionState('server-2')).toBeNull()
  })

  it('handles connection errors', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection refused') as never)

    const server = makeServer()
    await expect(mcpClient.connect(server)).rejects.toThrow('Connection refused')
    expect(mcpClient.getConnectionState(server.id)).toBeNull()
  })

  it('calls a tool and returns result', async () => {
    const server = makeServer()
    await mcpClient.connect(server)

    const result = await mcpClient.callTool(server.id, 'test-tool', { arg: 'value' })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].text).toBe('result')
    expect(mockCallTool).toHaveBeenCalledWith({ name: 'test-tool', arguments: { arg: 'value' } })
  })

  it('reads a resource', async () => {
    const server = makeServer()
    await mcpClient.connect(server)

    const result = await mcpClient.readResource(server.id, 'test://resource')

    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].text).toBe('content')
    expect(mockReadResource).toHaveBeenCalledWith({ uri: 'test://resource' })
  })

  it('accumulates traffic log entries', async () => {
    const server = makeServer()
    await mcpClient.connect(server)

    await mcpClient.listTools(server.id)
    await mcpClient.callTool(server.id, 'test-tool')

    const log = mcpClient.getTrafficLog(server.id)
    expect(log.length).toBeGreaterThanOrEqual(2)
    expect(log.some((e) => e.method === 'tools/list')).toBe(true)
    expect(log.some((e) => e.method === 'tools/call')).toBe(true)
  })

  it('clears traffic log', async () => {
    const server = makeServer()
    await mcpClient.connect(server)
    await mcpClient.listTools(server.id)

    mcpClient.clearTrafficLog(server.id)

    const log = mcpClient.getTrafficLog(server.id)
    expect(log).toHaveLength(0)
  })

  it('clears traffic log for specific server only', async () => {
    const server1 = makeServer({ id: 'server-1' })
    const server2 = makeServer({ id: 'server-2' })
    await mcpClient.connect(server1)
    await mcpClient.connect(server2)
    await mcpClient.listTools('server-1')
    await mcpClient.listTools('server-2')

    mcpClient.clearTrafficLog('server-1')

    expect(mcpClient.getTrafficLog('server-1')).toHaveLength(0)
    expect(mcpClient.getTrafficLog('server-2').length).toBeGreaterThan(0)
  })

  it('throws when calling tool on disconnected server', async () => {
    await expect(mcpClient.callTool('nonexistent', 'tool')).rejects.toThrow('Not connected')
  })

  it('returns all connection states', async () => {
    const server = makeServer()
    await mcpClient.connect(server)

    const states = mcpClient.getAllConnectionStates()
    expect(states).toHaveLength(1)
    expect(states[0].serverId).toBe('test-server-id')
  })

  it('replaces existing connection on reconnect', async () => {
    const server = makeServer()
    await mcpClient.connect(server)
    await mcpClient.connect(server)

    // Should have called close once for the first connection
    expect(mockClose).toHaveBeenCalledTimes(1)
    // And connect twice
    expect(mockConnect).toHaveBeenCalledTimes(2)
  })

  it('sets up notification handlers', async () => {
    const server = makeServer()
    await mcpClient.connect(server)

    // Should have set up handlers for tools, resources, and prompts list_changed
    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(3)
  })

  it('calls substitute during connection', async () => {
    const server = makeServer({
      command: '{{cmd}}',
      args: JSON.stringify(['{{arg1}}']),
      env: JSON.stringify({ KEY: '{{val}}' }),
      cwd: '{{cwd}}',
    })

    await mcpClient.connect(server)

    // substitute should be called for command, arg, env value, cwd
    expect(mockSubstitute).toHaveBeenCalledWith('{{cmd}}', 'ws-1')
    expect(mockSubstitute).toHaveBeenCalledWith('{{arg1}}', 'ws-1')
    expect(mockSubstitute).toHaveBeenCalledWith('{{val}}', 'ws-1')
    expect(mockSubstitute).toHaveBeenCalledWith('{{cwd}}', 'ws-1')
  })

  it('calls substitute for HTTP transport fields', async () => {
    const server = makeServer({
      transport_type: 'streamable-http',
      command: null,
      args: null,
      url: 'http://{{host}}/mcp',
      headers: JSON.stringify({ Authorization: 'Bearer {{token}}' }),
    })

    await mcpClient.connect(server)

    expect(mockSubstitute).toHaveBeenCalledWith('http://{{host}}/mcp', 'ws-1')
    expect(mockSubstitute).toHaveBeenCalledWith('Bearer {{token}}', 'ws-1')
  })
})
