/** GraphQL Subscription types */

export type GqlSubscriptionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface GqlSubscriptionEvent {
  id: string
  type: 'data' | 'error' | 'complete'
  data: string // JSON-stringified payload
  timestamp: number
}

export interface GqlSubStatusChanged {
  requestId: string
  status: GqlSubscriptionStatus
  error?: string
}
