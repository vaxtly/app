/**
 * MCP client service — manages connections to MCP servers.
 *
 * Runs in the main process. Uses @modelcontextprotocol/sdk for the client
 * and transports. Pushes status/traffic/notification events to the renderer.
 */

import { existsSync } from 'node:fs'
import { v4 as uuid } from 'uuid'
import { BrowserWindow } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  ToolListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { IPC } from '../../shared/types/ipc'
import { substitute } from './variable-substitution'
import { ensureLoaded } from '../vault/vault-sync-service'
import * as environmentsRepo from '../database/repositories/environments'
import type {
  McpServer,
  McpServerState,
  McpServerStatus,
  McpTool,
  McpResource,
  McpResourceTemplate,
  McpPrompt,
  McpTrafficEntry,
  McpNotification,
  McpToolCallResult,
  McpResourceReadResult,
  McpPromptGetResult,
} from '../../shared/types/mcp'

// --- Types ---

type Transport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

interface Connection {
  client: Client
  transport: Transport
  state: McpServerState
}

// --- State ---

const connections = new Map<string, Connection>()
const trafficLog: McpTrafficEntry[] = []
const MAX_TRAFFIC_ENTRIES = 500

// --- Helpers ---

/** Strip non-cloneable properties (Zod schemas, class instances) for Electron IPC */
function sanitize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function pushToRenderer(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, sanitize(data))
    }
  }
}

function addTrafficEntry(entry: McpTrafficEntry): void {
  trafficLog.push(entry)
  if (trafficLog.length > MAX_TRAFFIC_ENTRIES) {
    trafficLog.splice(0, trafficLog.length - MAX_TRAFFIC_ENTRIES)
  }
  pushToRenderer(IPC.MCP_TRAFFIC_PUSH, entry)
}

function setConnectionStatus(serverId: string, status: McpServerStatus, error?: string): void {
  const conn = connections.get(serverId)
  if (conn) {
    conn.state.status = status
    conn.state.error = error ?? null
  }
  pushToRenderer(IPC.MCP_STATUS_CHANGED, { serverId, status, error: error ?? null })
}

async function createTransportWithVars(server: McpServer): Promise<Transport> {
  // Build substitution helper from active environment
  const wsId = server.workspace_id
  const activeEnv = environmentsRepo.findActive(wsId)
  if (activeEnv?.vault_synced === 1) {
    try { await ensureLoaded(activeEnv.id, wsId) } catch { /* silent — vars just won't resolve */ }
  }
  const sub = (text: string): string => substitute(text, wsId)

  switch (server.transport_type) {
    case 'stdio': {
      if (!server.command) throw new Error('stdio transport requires a command')
      const args = server.args ? JSON.parse(server.args) as string[] : []
      const env = server.env ? JSON.parse(server.env) as Record<string, string> : undefined

      // Substitute: command, each arg, env values (not keys), cwd
      const resolvedCommand = sub(server.command)
      const resolvedArgs = args.map((a) => sub(a))
      let resolvedEnv: Record<string, string> | undefined
      if (env) {
        resolvedEnv = {}
        for (const [key, value] of Object.entries(env)) {
          resolvedEnv[key] = sub(value)
        }
      }
      const resolvedCwd = server.cwd ? sub(server.cwd) : undefined

      // Validate cwd exists before spawning — child_process.spawn throws a
      // cryptic "spawn cmd.exe ENOENT" on Windows when the cwd is invalid.
      if (resolvedCwd && !existsSync(resolvedCwd)) {
        throw new Error(`Working directory does not exist: ${resolvedCwd}`)
      }

      // Always pass the full process.env so the child gets all system vars
      // (COMSPEC, PATHEXT, WINDIR, etc.). The SDK's getDefaultEnvironment()
      // only inherits a small subset which can cause spawn failures on Windows.
      return new StdioClientTransport({
        command: resolvedCommand,
        args: resolvedArgs,
        env: { ...process.env, ...(resolvedEnv ?? {}) } as Record<string, string>,
        cwd: resolvedCwd,
      })
    }
    case 'streamable-http': {
      if (!server.url) throw new Error('streamable-http transport requires a URL')
      const headers = server.headers ? JSON.parse(server.headers) as Record<string, string> : undefined

      const resolvedUrl = sub(server.url)
      let resolvedHeaders: Record<string, string> | undefined
      if (headers) {
        resolvedHeaders = {}
        for (const [key, value] of Object.entries(headers)) {
          resolvedHeaders[key] = sub(value)
        }
      }

      return new StreamableHTTPClientTransport(
        new URL(resolvedUrl),
        { requestInit: resolvedHeaders ? { headers: resolvedHeaders } : undefined }
      )
    }
    case 'sse': {
      if (!server.url) throw new Error('SSE transport requires a URL')
      const sseHeaders = server.headers ? JSON.parse(server.headers) as Record<string, string> : undefined

      const resolvedUrl = sub(server.url)
      let resolvedHeaders: Record<string, string> | undefined
      if (sseHeaders) {
        resolvedHeaders = {}
        for (const [key, value] of Object.entries(sseHeaders)) {
          resolvedHeaders[key] = sub(value)
        }
      }

      return new SSEClientTransport(
        new URL(resolvedUrl),
        { requestInit: resolvedHeaders ? { headers: resolvedHeaders } : undefined }
      )
    }
    default:
      throw new Error(`Unknown transport type: ${server.transport_type}`)
  }
}

// --- Public API ---

export async function connect(server: McpServer): Promise<McpServerState> {
  // Disconnect existing connection if any
  if (connections.has(server.id)) {
    await disconnect(server.id)
  }

  const state: McpServerState = {
    serverId: server.id,
    status: 'connecting',
    error: null,
    serverInfo: null,
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
  }

  pushToRenderer(IPC.MCP_STATUS_CHANGED, { serverId: server.id, status: 'connecting', error: null })

  const transport = await createTransportWithVars(server)
  const client = new Client({ name: 'Vaxtly', version: '1.0.0' })

  const conn: Connection = { client, transport, state }
  connections.set(server.id, conn)

  // Wire notification handlers
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    await refreshTools(server.id)
    pushToRenderer(IPC.MCP_TOOLS_CHANGED, { serverId: server.id, tools: conn.state.tools })
  })

  client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
    await refreshResources(server.id)
    pushToRenderer(IPC.MCP_RESOURCES_CHANGED, {
      serverId: server.id,
      resources: conn.state.resources,
      resourceTemplates: conn.state.resourceTemplates,
    })
  })

  client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
    await refreshPrompts(server.id)
    pushToRenderer(IPC.MCP_PROMPTS_CHANGED, { serverId: server.id, prompts: conn.state.prompts })
  })

  // Handle generic notifications for the notifications pane
  const originalNotificationHandler = client.fallbackNotificationHandler
  client.fallbackNotificationHandler = async (notification) => {
    const entry: McpNotification = {
      id: uuid(),
      serverId: server.id,
      method: notification.method,
      params: notification.params,
      timestamp: new Date().toISOString(),
    }
    pushToRenderer(IPC.MCP_NOTIFICATION, entry)
    if (originalNotificationHandler) {
      await originalNotificationHandler(notification)
    }
  }

  try {
    await client.connect(transport)

    const serverVersion = client.getServerVersion()
    state.serverInfo = serverVersion ? {
      name: serverVersion.name ?? 'Unknown',
      version: serverVersion.version ?? 'Unknown',
      protocolVersion: serverVersion.protocolVersion,
    } : null

    // Fetch initial capabilities
    const [toolsResult, resourcesResult, resourceTemplatesResult, promptsResult] = await Promise.allSettled([
      client.listTools().catch(() => ({ tools: [] })),
      client.listResources().catch(() => ({ resources: [] })),
      client.listResourceTemplates().catch(() => ({ resourceTemplates: [] })),
      client.listPrompts().catch(() => ({ prompts: [] })),
    ])

    if (toolsResult.status === 'fulfilled') {
      state.tools = sanitize((toolsResult.value.tools ?? []) as McpTool[])
    }
    if (resourcesResult.status === 'fulfilled') {
      state.resources = sanitize((resourcesResult.value.resources ?? []) as McpResource[])
    }
    if (resourceTemplatesResult.status === 'fulfilled') {
      state.resourceTemplates = sanitize((resourceTemplatesResult.value.resourceTemplates ?? []) as McpResourceTemplate[])
    }
    if (promptsResult.status === 'fulfilled') {
      state.prompts = sanitize((promptsResult.value.prompts ?? []) as McpPrompt[])
    }

    state.status = 'connected'
    pushToRenderer(IPC.MCP_STATUS_CHANGED, { serverId: server.id, status: 'connected', error: null })

    return state
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    state.status = 'error'
    state.error = message
    pushToRenderer(IPC.MCP_STATUS_CHANGED, { serverId: server.id, status: 'error', error: message })
    // Clean up the failed connection
    connections.delete(server.id)
    try { await client.close() } catch { /* ignore cleanup errors */ }
    throw err
  }
}

export async function disconnect(serverId: string): Promise<void> {
  const conn = connections.get(serverId)
  if (!conn) return

  connections.delete(serverId)
  try {
    // Remove notification handlers before closing to prevent stale callbacks
    conn.client.removeNotificationHandler('notifications/tools/list_changed')
    conn.client.removeNotificationHandler('notifications/resources/list_changed')
    conn.client.removeNotificationHandler('notifications/prompts/list_changed')
    conn.client.fallbackNotificationHandler = undefined
    await conn.client.close()
  } catch {
    // ignore close errors
  }
  pushToRenderer(IPC.MCP_STATUS_CHANGED, { serverId, status: 'disconnected', error: null })
}

export async function disconnectAll(): Promise<void> {
  const ids = Array.from(connections.keys())
  await Promise.allSettled(ids.map((id) => disconnect(id)))
}

// --- Primitive wrappers ---

export async function listTools(serverId: string): Promise<McpTool[]> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error('Not connected')

  const entry: McpTrafficEntry = {
    id: uuid(), serverId, direction: 'outgoing', method: 'tools/list',
    timestamp: new Date().toISOString(),
  }

  try {
    const result = sanitize(await conn.client.listTools())
    conn.state.tools = (result.tools ?? []) as McpTool[]
    entry.result = result
    addTrafficEntry(entry)
    return conn.state.tools
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    addTrafficEntry(entry)
    throw err
  }
}

export async function callTool(serverId: string, name: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error('Not connected')

  const entry: McpTrafficEntry = {
    id: uuid(), serverId, direction: 'outgoing', method: 'tools/call',
    params: { name, arguments: args },
    timestamp: new Date().toISOString(),
  }

  try {
    const result = sanitize(await conn.client.callTool({ name, arguments: args }))
    const callResult: McpToolCallResult = {
      content: (result.content ?? []) as McpToolCallResult['content'],
      isError: result.isError as boolean | undefined,
    }
    entry.result = callResult
    addTrafficEntry(entry)
    return callResult
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    addTrafficEntry(entry)
    throw err
  }
}

export async function listResources(serverId: string): Promise<McpResource[]> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error('Not connected')

  const entry: McpTrafficEntry = {
    id: uuid(), serverId, direction: 'outgoing', method: 'resources/list',
    timestamp: new Date().toISOString(),
  }

  try {
    const result = sanitize(await conn.client.listResources())
    conn.state.resources = (result.resources ?? []) as McpResource[]
    entry.result = result
    addTrafficEntry(entry)
    return conn.state.resources
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    addTrafficEntry(entry)
    throw err
  }
}

export async function readResource(serverId: string, uri: string): Promise<McpResourceReadResult> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error('Not connected')

  const entry: McpTrafficEntry = {
    id: uuid(), serverId, direction: 'outgoing', method: 'resources/read',
    params: { uri },
    timestamp: new Date().toISOString(),
  }

  try {
    const result = sanitize(await conn.client.readResource({ uri }))
    const readResult: McpResourceReadResult = {
      contents: (result.contents ?? []) as McpResourceReadResult['contents'],
    }
    entry.result = readResult
    addTrafficEntry(entry)
    return readResult
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    addTrafficEntry(entry)
    throw err
  }
}

export async function listResourceTemplates(serverId: string): Promise<McpResourceTemplate[]> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error('Not connected')

  const entry: McpTrafficEntry = {
    id: uuid(), serverId, direction: 'outgoing', method: 'resources/templates/list',
    timestamp: new Date().toISOString(),
  }

  try {
    const result = sanitize(await conn.client.listResourceTemplates())
    conn.state.resourceTemplates = (result.resourceTemplates ?? []) as McpResourceTemplate[]
    entry.result = result
    addTrafficEntry(entry)
    return conn.state.resourceTemplates
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    addTrafficEntry(entry)
    throw err
  }
}

export async function listPrompts(serverId: string): Promise<McpPrompt[]> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error('Not connected')

  const entry: McpTrafficEntry = {
    id: uuid(), serverId, direction: 'outgoing', method: 'prompts/list',
    timestamp: new Date().toISOString(),
  }

  try {
    const result = sanitize(await conn.client.listPrompts())
    conn.state.prompts = (result.prompts ?? []) as McpPrompt[]
    entry.result = result
    addTrafficEntry(entry)
    return conn.state.prompts
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    addTrafficEntry(entry)
    throw err
  }
}

export async function getPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<McpPromptGetResult> {
  const conn = connections.get(serverId)
  if (!conn) throw new Error('Not connected')

  const entry: McpTrafficEntry = {
    id: uuid(), serverId, direction: 'outgoing', method: 'prompts/get',
    params: { name, arguments: args },
    timestamp: new Date().toISOString(),
  }

  try {
    const result = sanitize(await conn.client.getPrompt({ name, arguments: args }))
    const getResult: McpPromptGetResult = {
      description: result.description,
      messages: (result.messages ?? []) as McpPromptGetResult['messages'],
    }
    entry.result = getResult
    addTrafficEntry(entry)
    return getResult
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    addTrafficEntry(entry)
    throw err
  }
}

// --- Traffic log ---

export function getTrafficLog(serverId?: string): McpTrafficEntry[] {
  if (serverId) return trafficLog.filter((e) => e.serverId === serverId)
  return [...trafficLog]
}

export function clearTrafficLog(serverId?: string): void {
  if (serverId) {
    const keep = trafficLog.filter((e) => e.serverId !== serverId)
    trafficLog.length = 0
    trafficLog.push(...keep)
  } else {
    trafficLog.length = 0
  }
}

// --- State queries ---

export function getConnectionState(serverId: string): McpServerState | null {
  return connections.get(serverId)?.state ?? null
}

export function getAllConnectionStates(): McpServerState[] {
  return Array.from(connections.values()).map((c) => c.state)
}

// --- Internal helpers ---

async function refreshTools(serverId: string): Promise<void> {
  const conn = connections.get(serverId)
  if (!conn) return
  try {
    const result = sanitize(await conn.client.listTools())
    conn.state.tools = (result.tools ?? []) as McpTool[]
  } catch {
    // ignore — server may not support tools
  }
}

async function refreshResources(serverId: string): Promise<void> {
  const conn = connections.get(serverId)
  if (!conn) return
  try {
    const result = sanitize(await conn.client.listResources())
    conn.state.resources = (result.resources ?? []) as McpResource[]
  } catch {
    // ignore
  }
  try {
    const result = sanitize(await conn.client.listResourceTemplates())
    conn.state.resourceTemplates = (result.resourceTemplates ?? []) as McpResourceTemplate[]
  } catch {
    // ignore
  }
}

async function refreshPrompts(serverId: string): Promise<void> {
  const conn = connections.get(serverId)
  if (!conn) return
  try {
    const result = sanitize(await conn.client.listPrompts())
    conn.state.prompts = (result.prompts ?? []) as McpPrompt[]
  } catch {
    // ignore
  }
}
