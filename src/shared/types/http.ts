/** HTTP proxy types for request/response communication */

export interface RequestConfig {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  bodyType?: BodyType
  formData?: FormDataEntry[]
  timeout?: number
  followRedirects?: boolean
  verifySsl?: boolean
  /** Variable substitution scope */
  workspaceId?: string
  collectionId?: string
}

export type BodyType = 'none' | 'json' | 'xml' | 'form-data' | 'urlencoded' | 'raw' | 'graphql'

export interface FormDataEntry {
  key: string
  value: string
  type: 'text' | 'file'
  filePath?: string
  fileName?: string
  enabled: boolean
}

export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: number
  timing: ResponseTiming
  cookies: ResponseCookie[]
  isSSE?: boolean
  sseEvents?: SSEEvent[]
}

export interface ResponseTiming {
  start: number
  ttfb: number
  total: number
}

/** A single parsed SSE event */
export interface SSEEvent {
  id?: string
  event: string
  data: string
  timestamp: number
}

export interface SSEChunk {
  requestId: string
  event: SSEEvent
  accumulatedSize: number
}

export interface SSEStreamStart {
  requestId: string
  status: number
  statusText: string
  headers: Record<string, string>
  cookies: ResponseCookie[]
  timing: { start: number; ttfb: number }
}

export interface SSEStreamEnd {
  requestId: string
  body: string
  size: number
  timing: ResponseTiming
  eventCount: number
  error?: string
}

export interface ResponseCookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
}
