/** WebSocket connection types shared between main and renderer. */

export type WsConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface WsConnectionConfig {
  url: string
  headers?: string | null // JSON string: KeyValueEntry[]
  protocols?: string | null // comma-separated subprotocols
  workspaceId?: string
  collectionId?: string
}

export interface WsConnectionState {
  connectionId: string
  status: WsConnectionStatus
  connectedAt?: number
  error?: string
  messageCount: number
}

export interface WsMessage {
  id: string
  connection_id: string
  direction: 'sent' | 'received'
  data: string
  timestamp: string
  size: number
}

export interface WsStatusChanged {
  connectionId: string
  status: WsConnectionStatus
  error?: string
}

export interface WsMessageReceived {
  connectionId: string
  message: WsMessage
}
