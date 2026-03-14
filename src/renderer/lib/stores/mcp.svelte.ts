/**
 * MCP store — manages MCP server list, connection states, traffic, and notifications.
 * Uses Svelte 5 runes for fine-grained reactivity.
 */

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
} from '../../lib/types'

// --- State ---

let servers = $state<McpServer[]>([])
let connectionStates = $state<Record<string, McpServerState>>({})
let trafficLog = $state<McpTrafficEntry[]>([])
let notifications = $state<McpNotification[]>([])
let activeServerId = $state<string | null>(null)

// --- Derived ---

const activeServer = $derived(servers.find((s) => s.id === activeServerId) ?? null)
const activeConnectionState = $derived(activeServerId ? connectionStates[activeServerId] ?? null : null)

// --- Actions ---

async function loadServers(workspaceId: string): Promise<void> {
  servers = await window.api.mcp.servers.list(workspaceId)
}

async function createServer(data: {
  workspace_id: string
  name: string
  transport_type?: string
  command?: string
  args?: string
  env?: string
  cwd?: string
  url?: string
  headers?: string
}): Promise<McpServer> {
  const server = await window.api.mcp.servers.create(data)
  servers = [...servers, server]
  return server
}

async function updateServer(id: string, data: Partial<McpServer>): Promise<McpServer | undefined> {
  const updated = await window.api.mcp.servers.update(id, data)
  if (updated) {
    servers = servers.map((s) => (s.id === id ? updated : s))
  }
  return updated
}

async function deleteServer(id: string): Promise<void> {
  await window.api.mcp.servers.delete(id)
  servers = servers.filter((s) => s.id !== id)
  delete connectionStates[id]
  if (activeServerId === id) {
    activeServerId = null
  }
}

async function reorderServers(ids: string[]): Promise<void> {
  await window.api.mcp.servers.reorder(ids)
  const ordered: McpServer[] = []
  for (const id of ids) {
    const s = servers.find((srv) => srv.id === id)
    if (s) ordered.push(s)
  }
  servers = ordered
}

async function connect(serverId: string): Promise<McpServerState> {
  // Set optimistic connecting state
  connectionStates[serverId] = {
    serverId,
    status: 'connecting',
    error: null,
    serverInfo: null,
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
  }

  try {
    const state = await window.api.mcp.connect(serverId)
    connectionStates[serverId] = state
    return state
  } catch (err) {
    connectionStates[serverId] = {
      serverId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      serverInfo: null,
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    }
    throw err
  }
}

async function disconnect(serverId: string): Promise<void> {
  await window.api.mcp.disconnect(serverId)
  delete connectionStates[serverId]
}

function setActiveServer(serverId: string | null): void {
  activeServerId = serverId
}

// --- Push event handlers ---

function handleStatusChanged(data: { serverId: string; status: string; error: string | null }): void {
  const existing = connectionStates[data.serverId]
  if (existing) {
    connectionStates[data.serverId] = {
      ...existing,
      status: data.status as McpServerStatus,
      error: data.error,
    }
  } else if (data.status !== 'disconnected') {
    connectionStates[data.serverId] = {
      serverId: data.serverId,
      status: data.status as McpServerStatus,
      error: data.error,
      serverInfo: null,
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    }
  } else {
    delete connectionStates[data.serverId]
  }
}

function handleToolsChanged(data: { serverId: string; tools: McpTool[] }): void {
  const existing = connectionStates[data.serverId]
  if (existing) {
    connectionStates[data.serverId] = { ...existing, tools: data.tools }
  }
}

function handleResourcesChanged(data: { serverId: string; resources: McpResource[]; resourceTemplates: McpResourceTemplate[] }): void {
  const existing = connectionStates[data.serverId]
  if (existing) {
    connectionStates[data.serverId] = {
      ...existing,
      resources: data.resources,
      resourceTemplates: data.resourceTemplates,
    }
  }
}

function handlePromptsChanged(data: { serverId: string; prompts: McpPrompt[] }): void {
  const existing = connectionStates[data.serverId]
  if (existing) {
    connectionStates[data.serverId] = { ...existing, prompts: data.prompts }
  }
}

function handleTrafficPush(entry: McpTrafficEntry): void {
  trafficLog.push(entry)
  if (trafficLog.length > 500) {
    trafficLog.splice(0, trafficLog.length - 500)
  }
}

function handleNotification(entry: McpNotification): void {
  notifications.push(entry)
  if (notifications.length > 500) {
    notifications.splice(0, notifications.length - 500)
  }
}

function clearNotifications(serverId?: string): void {
  if (serverId) {
    notifications = notifications.filter((n) => n.serverId !== serverId)
  } else {
    notifications = []
  }
}

function clearTraffic(serverId?: string): void {
  if (serverId) {
    trafficLog = trafficLog.filter((e) => e.serverId !== serverId)
  } else {
    trafficLog = []
  }
}

// --- Primitive wrappers ---

async function callTool(serverId: string, name: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
  // $state.snapshot() strips Svelte 5 reactive proxies so Electron IPC can clone the args
  return window.api.mcp.callTool(serverId, name, args ? $state.snapshot(args) : undefined)
}

async function readResource(serverId: string, uri: string): Promise<McpResourceReadResult> {
  return window.api.mcp.readResource(serverId, uri)
}

async function getPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<McpPromptGetResult> {
  return window.api.mcp.getPrompt(serverId, name, args ? $state.snapshot(args) : undefined)
}

// --- Export ---

export const mcpStore = {
  get servers() { return servers },
  get connectionStates() { return connectionStates },
  get trafficLog() { return trafficLog },
  get notifications() { return notifications },
  get activeServerId() { return activeServerId },
  get activeServer() { return activeServer },
  get activeConnectionState() { return activeConnectionState },

  loadServers,
  createServer,
  updateServer,
  deleteServer,
  reorderServers,
  connect,
  disconnect,
  setActiveServer,
  callTool,
  readResource,
  getPrompt,
  clearNotifications,
  clearTraffic,

  // Push handlers
  handleStatusChanged,
  handleToolsChanged,
  handleResourcesChanged,
  handlePromptsChanged,
  handleTrafficPush,
  handleNotification,
}
