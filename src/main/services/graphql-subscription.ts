/**
 * GraphQL Subscription client — implements the graphql-ws protocol over WebSocket.
 * Protocol: graphql-transport-ws (https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
 *
 * No new npm dependency — uses raw WebSocket messages.
 */

import { WebSocket } from 'ws'
import { v4 as uuid } from 'uuid'
import { createHttpsAgent } from './tls-options'
import * as settingsRepo from '../database/repositories/settings'
import type { GqlSubscriptionEvent, GqlSubStatusChanged } from '../../shared/types/graphql-subscription'

interface ActiveSubscription {
  ws: WebSocket
  subscriptionId: string
  requestId: string
}

const activeSubscriptions = new Map<string, ActiveSubscription>()

export interface GqlSubCallbacks {
  onStatusChanged: (data: GqlSubStatusChanged) => void
  onEvent: (data: { requestId: string; event: GqlSubscriptionEvent }) => void
}

/**
 * Subscribe to a GraphQL subscription.
 * One subscription per requestId at a time.
 */
export function subscribe(
  requestId: string,
  config: {
    url: string
    query: string
    variables?: Record<string, unknown>
    headers?: Record<string, string>
    workspaceId?: string
    collectionId?: string
  },
  callbacks: GqlSubCallbacks,
): void {
  // Clean up existing subscription for this request
  unsubscribe(requestId)

  const subscriptionId = uuid()

  // Convert HTTP URL to WebSocket URL
  let wsUrl = config.url
  if (wsUrl.startsWith('https://')) {
    wsUrl = 'wss://' + wsUrl.slice(8)
  } else if (wsUrl.startsWith('http://')) {
    wsUrl = 'ws://' + wsUrl.slice(7)
  }

  callbacks.onStatusChanged({ requestId, status: 'connecting' })

  const verifySsl = settingsRepo.getSetting('request.verify_ssl') !== 'false'
  const agentOptions = createHttpsAgent(verifySsl)

  const ws = new WebSocket(wsUrl, ['graphql-transport-ws'], {
    headers: config.headers ?? {},
    ...agentOptions,
  })

  const sub: ActiveSubscription = { ws, subscriptionId, requestId }
  activeSubscriptions.set(requestId, sub)

  let ackReceived = false
  const connectionTimeout = setTimeout(() => {
    if (!ackReceived) {
      callbacks.onStatusChanged({ requestId, status: 'error', error: 'Connection timeout — no ack received' })
      ws.close()
    }
  }, 10_000)

  ws.on('open', () => {
    // Step 1: connection_init with auth headers
    ws.send(JSON.stringify({
      type: 'connection_init',
      payload: config.headers ? { headers: config.headers } : {},
    }))
  })

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString())

      switch (msg.type) {
        case 'connection_ack': {
          ackReceived = true
          clearTimeout(connectionTimeout)
          callbacks.onStatusChanged({ requestId, status: 'connected' })

          // Step 2: subscribe
          ws.send(JSON.stringify({
            id: subscriptionId,
            type: 'subscribe',
            payload: {
              query: config.query,
              variables: config.variables ?? {},
            },
          }))
          break
        }

        case 'next': {
          if (msg.id !== subscriptionId) break
          const event: GqlSubscriptionEvent = {
            id: uuid(),
            type: 'data',
            data: JSON.stringify(msg.payload ?? {}),
            timestamp: Date.now(),
          }
          callbacks.onEvent({ requestId, event })
          break
        }

        case 'error': {
          if (msg.id !== subscriptionId) break
          const errors = Array.isArray(msg.payload) ? msg.payload : [msg.payload]
          const event: GqlSubscriptionEvent = {
            id: uuid(),
            type: 'error',
            data: JSON.stringify(errors),
            timestamp: Date.now(),
          }
          callbacks.onEvent({ requestId, event })
          break
        }

        case 'complete': {
          if (msg.id !== subscriptionId) break
          const event: GqlSubscriptionEvent = {
            id: uuid(),
            type: 'complete',
            data: '{}',
            timestamp: Date.now(),
          }
          callbacks.onEvent({ requestId, event })
          callbacks.onStatusChanged({ requestId, status: 'disconnected' })
          cleanup(requestId)
          break
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }))
          break
        }
      }
    } catch {
      // Ignore unparseable messages
    }
  })

  ws.on('close', () => {
    clearTimeout(connectionTimeout)
    if (activeSubscriptions.has(requestId)) {
      callbacks.onStatusChanged({ requestId, status: 'disconnected' })
      cleanup(requestId)
    }
  })

  ws.on('error', (err: Error) => {
    clearTimeout(connectionTimeout)
    callbacks.onStatusChanged({ requestId, status: 'error', error: err.message })
    cleanup(requestId)
  })
}

/**
 * Unsubscribe from a GraphQL subscription.
 */
export function unsubscribe(requestId: string): void {
  const sub = activeSubscriptions.get(requestId)
  if (!sub) return

  try {
    // Send complete message to server
    if (sub.ws.readyState === WebSocket.OPEN) {
      sub.ws.send(JSON.stringify({
        id: sub.subscriptionId,
        type: 'complete',
      }))
    }
    sub.ws.close()
  } catch {
    // Ignore close errors
  }

  cleanup(requestId)
}

/**
 * Disconnect all active subscriptions (called on app quit).
 */
export function disconnectAll(): void {
  for (const requestId of [...activeSubscriptions.keys()]) {
    unsubscribe(requestId)
  }
}

function cleanup(requestId: string): void {
  activeSubscriptions.delete(requestId)
}
