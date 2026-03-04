/**
 * WebSocket store — reactive state for WebSocket connections and message logs.
 */

import type { WsConnectionState, WsConnectionStatus, WsMessage, WsStatusChanged, WsMessageReceived } from '../../lib/types'
import { WS_MESSAGE_LOG_MAX } from '@shared/constants'

// --- State ---

let connectionStates = $state<Record<string, WsConnectionState>>({})
let messageLogs = $state<Record<string, WsMessage[]>>({})

// --- Actions ---

async function connect(connectionId: string, config: { url: string; headers?: string | null; protocols?: string | null; workspaceId?: string; collectionId?: string }): Promise<WsConnectionState> {
  connectionStates[connectionId] = {
    connectionId,
    status: 'connecting',
    messageCount: 0,
  }
  return await window.api.ws.connect(connectionId, config)
}

async function disconnect(connectionId: string): Promise<void> {
  await window.api.ws.disconnect(connectionId)
  if (connectionStates[connectionId]) {
    connectionStates[connectionId] = { ...connectionStates[connectionId], status: 'disconnected' }
  }
}

async function sendMessage(connectionId: string, data: string): Promise<void> {
  await window.api.ws.send(connectionId, data)
}

function handleStatusChanged(data: WsStatusChanged): void {
  const existing = connectionStates[data.connectionId]
  connectionStates[data.connectionId] = {
    connectionId: data.connectionId,
    status: data.status,
    error: data.error,
    connectedAt: data.status === 'connected' ? Date.now() : existing?.connectedAt,
    messageCount: existing?.messageCount ?? 0,
  }
}

function handleMessageReceived(data: WsMessageReceived): void {
  const { connectionId, message } = data
  const existing = messageLogs[connectionId] ?? []
  const updated = [...existing, message]
  messageLogs[connectionId] = updated.length > WS_MESSAGE_LOG_MAX
    ? updated.slice(-WS_MESSAGE_LOG_MAX)
    : updated

  // Update message count
  if (connectionStates[connectionId]) {
    connectionStates[connectionId] = {
      ...connectionStates[connectionId],
      messageCount: (connectionStates[connectionId].messageCount ?? 0) + 1,
    }
  }
}

async function loadMessages(connectionId: string): Promise<void> {
  const messages = await window.api.ws.messages.list(connectionId)
  messageLogs[connectionId] = messages
}

async function clearMessages(connectionId: string): Promise<void> {
  await window.api.ws.messages.clear(connectionId)
  messageLogs[connectionId] = []
  if (connectionStates[connectionId]) {
    connectionStates[connectionId] = { ...connectionStates[connectionId], messageCount: 0 }
  }
}

function getState(connectionId: string): WsConnectionState | undefined {
  return connectionStates[connectionId]
}

function getMessages(connectionId: string): WsMessage[] {
  return messageLogs[connectionId] ?? []
}

// --- Export ---

export const wsStore = {
  get connectionStates() { return connectionStates },
  get messageLogs() { return messageLogs },

  connect,
  disconnect,
  sendMessage,
  handleStatusChanged,
  handleMessageReceived,
  loadMessages,
  clearMessages,
  getState,
  getMessages,
}
