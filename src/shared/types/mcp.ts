/** MCP (Model Context Protocol) type definitions for server management and inspection. */

// --- Transport & Status ---

export type McpTransportType = 'stdio' | 'streamable-http' | 'sse'

export type McpServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// --- Database Entity ---

export interface McpServer {
  id: string
  workspace_id: string
  name: string
  transport_type: McpTransportType
  command: string | null // stdio
  args: string | null // stdio — JSON string: string[]
  env: string | null // stdio — JSON string: Record<string, string>
  cwd: string | null // stdio
  url: string | null // streamable-http, sse
  headers: string | null // streamable-http, sse — JSON string: Record<string, string>
  order: number
  created_at: string
  updated_at: string
}

// --- Runtime State ---

export interface McpServerInfo {
  name: string
  version: string
  protocolVersion?: string
}

export interface McpServerState {
  serverId: string
  status: McpServerStatus
  error: string | null
  serverInfo: McpServerInfo | null
  tools: McpTool[]
  resources: McpResource[]
  resourceTemplates: McpResourceTemplate[]
  prompts: McpPrompt[]
}

// --- Primitives ---

export interface McpTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpResourceTemplate {
  uriTemplate: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpPromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface McpPrompt {
  name: string
  description?: string
  arguments?: McpPromptArgument[]
}

// --- Results ---

export interface McpContentBlock {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string // base64
  mimeType?: string
  uri?: string
  resource?: { uri: string; mimeType?: string; text?: string; blob?: string }
}

export interface McpToolCallResult {
  content: McpContentBlock[]
  isError?: boolean
}

export interface McpResourceReadResult {
  contents: Array<{
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }>
}

export interface McpPromptMessage {
  role: 'user' | 'assistant'
  content: McpContentBlock
}

export interface McpPromptGetResult {
  description?: string
  messages: McpPromptMessage[]
}

// --- Traffic & Notifications ---

export interface McpTrafficEntry {
  id: string
  serverId: string
  direction: 'outgoing' | 'incoming'
  method: string
  params?: unknown
  result?: unknown
  error?: unknown
  timestamp: string
}

export interface McpNotification {
  id: string
  serverId: string
  method: string
  params?: unknown
  timestamp: string
}
