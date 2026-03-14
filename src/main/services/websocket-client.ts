/**
 * WebSocket client service — manages persistent connections in the main process.
 *
 * Mirrors the MCP client pattern: connections stored in a Map, events pushed to
 * all renderer windows via BrowserWindow.getAllWindows().
 */

import { createHttpsAgent } from './tls-options'
import { v4 as uuid } from 'uuid'
import { BrowserWindow } from 'electron'
import WebSocket from 'ws'
import { IPC } from '../../shared/types/ipc'
import { substitute } from './variable-substitution'
import { ensureLoaded } from '../vault/vault-sync-service'
import * as environmentsRepo from '../database/repositories/environments'
import * as wsMessagesRepo from '../database/repositories/websocket-messages'
import { getSetting } from '../database/repositories/settings'
import type { WsConnectionConfig, WsConnectionState, WsMessage } from '../../shared/types/websocket'
import type { KeyValueEntry } from '../../shared/types/models'

// --- Types ---

interface ManagedConnection {
  ws: WebSocket
  state: WsConnectionState
  workspaceId?: string
  collectionId?: string
}

// --- State ---

const connections = new Map<string, ManagedConnection>()

// --- Helpers ---

function pushToRenderer(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

function resolveHeaders(headersJson: string | null | undefined, sub: (s: string) => string): Record<string, string> | undefined {
  if (!headersJson) return undefined
  const entries: KeyValueEntry[] = JSON.parse(headersJson)
  const resolved: Record<string, string> = {}
  for (const entry of entries) {
    if (entry.enabled && entry.key) {
      resolved[sub(entry.key)] = sub(entry.value)
    }
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined
}

// --- Public API ---

export async function connect(connectionId: string, config: WsConnectionConfig): Promise<WsConnectionState> {
  // Disconnect existing connection if any
  if (connections.has(connectionId)) {
    await disconnect(connectionId)
  }

  const state: WsConnectionState = {
    connectionId,
    status: 'connecting',
    messageCount: 0,
  }

  pushToRenderer(IPC.WS_STATUS_CHANGED, { connectionId, status: 'connecting' })

  // Build substitution helper from active environment
  const wsId = config.workspaceId
  const activeEnv = wsId ? environmentsRepo.findActive(wsId) : undefined
  if (activeEnv?.vault_synced === 1) {
    try { await ensureLoaded(activeEnv.id, wsId) } catch { /* silent */ }
  }
  const sub = (text: string): string => substitute(text, wsId, config.collectionId)

  let resolvedUrl = sub(config.url)
  // Auto-correct http(s) schemes to ws(s) so the ws library can connect
  if (resolvedUrl.startsWith('https://')) {
    resolvedUrl = 'wss://' + resolvedUrl.slice(8)
  } else if (resolvedUrl.startsWith('http://')) {
    resolvedUrl = 'ws://' + resolvedUrl.slice(7)
  }
  const headers = resolveHeaders(config.headers, sub)

  // TLS: custom certs + SSL verification
  const verifySsl = getSetting('request.verify_ssl') !== 'false'
  const agent = createHttpsAgent(verifySsl)

  // Parse protocols
  const protocols = config.protocols
    ? config.protocols.split(',').map((p) => p.trim()).filter(Boolean)
    : undefined

  try {
    const ws = new WebSocket(resolvedUrl, protocols, {
      headers,
      agent,
    })

    const conn: ManagedConnection = { ws, state, workspaceId: wsId, collectionId: config.collectionId }
    connections.set(connectionId, conn)

    ws.on('open', () => {
      state.status = 'connected'
      state.connectedAt = Date.now()
      state.error = undefined
      pushToRenderer(IPC.WS_STATUS_CHANGED, { connectionId, status: 'connected' })
    })

    ws.on('message', (rawData) => {
      const data = rawData.toString()
      const msg = wsMessagesRepo.create({
        connection_id: connectionId,
        direction: 'received',
        data,
      })
      state.messageCount++
      wsMessagesRepo.trimToMax(connectionId)
      pushToRenderer(IPC.WS_MESSAGE_RECEIVED, { connectionId, message: msg })
    })

    ws.on('close', () => {
      state.status = 'disconnected'
      connections.delete(connectionId)
      pushToRenderer(IPC.WS_STATUS_CHANGED, { connectionId, status: 'disconnected' })
    })

    ws.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      state.status = 'error'
      state.error = message
      pushToRenderer(IPC.WS_STATUS_CHANGED, { connectionId, status: 'error', error: message })
    })

    // Wait for open or error before returning
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', (err) => reject(err))
    })

    return state
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    state.status = 'error'
    state.error = message
    connections.delete(connectionId)
    pushToRenderer(IPC.WS_STATUS_CHANGED, { connectionId, status: 'error', error: message })
    throw err
  }
}

export async function disconnect(connectionId: string): Promise<void> {
  const conn = connections.get(connectionId)
  if (!conn) return

  connections.delete(connectionId)
  try {
    conn.ws.removeAllListeners()
    conn.ws.close()
  } catch {
    // ignore close errors
  }
  pushToRenderer(IPC.WS_STATUS_CHANGED, { connectionId, status: 'disconnected' })
}

export function sendMessage(connectionId: string, data: string): WsMessage {
  const conn = connections.get(connectionId)
  if (!conn || conn.state.status !== 'connected') {
    throw new Error('Not connected')
  }

  // Substitute {{variables}} in the message
  const resolvedData = substitute(data, conn.workspaceId, conn.collectionId)

  conn.ws.send(resolvedData)

  const msg = wsMessagesRepo.create({
    connection_id: connectionId,
    direction: 'sent',
    data: resolvedData,
  })
  conn.state.messageCount++
  wsMessagesRepo.trimToMax(connectionId)
  pushToRenderer(IPC.WS_MESSAGE_RECEIVED, { connectionId, message: msg })

  return msg
}

export function getState(connectionId: string): WsConnectionState | null {
  return connections.get(connectionId)?.state ?? null
}

export async function disconnectAll(): Promise<void> {
  const ids = Array.from(connections.keys())
  await Promise.allSettled(ids.map((id) => disconnect(id)))
}
