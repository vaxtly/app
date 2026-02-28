import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as mcpServersRepo from '../database/repositories/mcp-servers'
import * as mcpClient from '../services/mcp-client'
import { deleteMcpServerRemote } from '../sync/remote-sync-service'

/** Strip non-cloneable properties (Zod schemas, class instances) for Electron IPC */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function registerMcpHandlers(): void {
  // --- CRUD ---

  ipcMain.handle(IPC.MCP_SERVERS_LIST, (_event, workspaceId: string) => {
    return mcpServersRepo.findByWorkspace(workspaceId)
  })

  ipcMain.handle(IPC.MCP_SERVERS_CREATE, (_event, data: {
    workspace_id: string
    name: string
    transport_type?: string
    command?: string
    args?: string
    env?: string
    cwd?: string
    url?: string
    headers?: string
  }) => {
    return mcpServersRepo.create(data)
  })

  ipcMain.handle(IPC.MCP_SERVERS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    const existing = mcpServersRepo.findById(id)
    const result = mcpServersRepo.update(id, data)

    // Mark dirty if sync is enabled and config fields changed (not just reorder)
    if (existing && existing.sync_enabled === 1) {
      const configFields = ['name', 'transport_type', 'command', 'args', 'env', 'cwd', 'url', 'headers']
      const hasConfigChange = configFields.some((f) => f in data)
      if (hasConfigChange) {
        mcpServersRepo.markDirty(id)
      }
    }

    return result
  })

  ipcMain.handle(IPC.MCP_SERVERS_DELETE, async (_event, id: string) => {
    const server = mcpServersRepo.findById(id)

    // Disconnect first if connected
    await mcpClient.disconnect(id)

    // Delete from remote if it was synced
    if (server?.remote_sha) {
      deleteMcpServerRemote(server).catch((e) => {
        console.error('Failed to delete remote MCP server:', e)
      })
    }

    return mcpServersRepo.remove(id)
  })

  ipcMain.handle(IPC.MCP_SERVERS_REORDER, (_event, ids: string[]) => {
    mcpServersRepo.reorder(ids)
  })

  // --- Connection ---

  ipcMain.handle(IPC.MCP_CONNECT, async (_event, serverId: string) => {
    const server = mcpServersRepo.findById(serverId)
    if (!server) throw new Error(`MCP server not found: ${serverId}`)
    return toPlain(await mcpClient.connect(server))
  })

  ipcMain.handle(IPC.MCP_DISCONNECT, async (_event, serverId: string) => {
    await mcpClient.disconnect(serverId)
  })

  // --- Primitives ---

  ipcMain.handle(IPC.MCP_LIST_TOOLS, async (_event, serverId: string) => {
    return toPlain(await mcpClient.listTools(serverId))
  })

  ipcMain.handle(IPC.MCP_CALL_TOOL, async (_event, serverId: string, name: string, args?: Record<string, unknown>) => {
    return toPlain(await mcpClient.callTool(serverId, name, args))
  })

  ipcMain.handle(IPC.MCP_LIST_RESOURCES, async (_event, serverId: string) => {
    return toPlain(await mcpClient.listResources(serverId))
  })

  ipcMain.handle(IPC.MCP_READ_RESOURCE, async (_event, serverId: string, uri: string) => {
    return toPlain(await mcpClient.readResource(serverId, uri))
  })

  ipcMain.handle(IPC.MCP_LIST_RESOURCE_TEMPLATES, async (_event, serverId: string) => {
    return toPlain(await mcpClient.listResourceTemplates(serverId))
  })

  ipcMain.handle(IPC.MCP_LIST_PROMPTS, async (_event, serverId: string) => {
    return toPlain(await mcpClient.listPrompts(serverId))
  })

  ipcMain.handle(IPC.MCP_GET_PROMPT, async (_event, serverId: string, name: string, args?: Record<string, string>) => {
    return toPlain(await mcpClient.getPrompt(serverId, name, args))
  })

  // --- Traffic ---

  ipcMain.handle(IPC.MCP_TRAFFIC_LIST, (_event, serverId?: string) => {
    return toPlain(mcpClient.getTrafficLog(serverId))
  })

  ipcMain.handle(IPC.MCP_TRAFFIC_CLEAR, (_event, serverId?: string) => {
    mcpClient.clearTrafficLog(serverId)
  })
}
