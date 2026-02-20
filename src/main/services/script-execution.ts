/**
 * Script execution service — handles pre-request and post-response scripts.
 *
 * Pre-request: fires a dependent request before the main request.
 * Post-response: extracts a value from the response and sets it as a collection variable.
 */

import { Agent, fetch as undiciFetch } from 'undici'
import * as requestsRepo from '../database/repositories/requests'
import * as collectionsRepo from '../database/repositories/collections'
import * as environmentsRepo from '../database/repositories/environments'
import * as settingsRepo from '../database/repositories/settings'
import { substitute } from './variable-substitution'
import { DEFAULTS } from '../../shared/constants'
import { logHttp } from './session-log'
import type { ScriptsConfig, PreRequestScript, PostResponseScript } from '../../shared/types/models'
import type { ResponseData } from '../../shared/types/http'

/**
 * Execute pre-request scripts. Returns true if the main request should proceed.
 */
export async function executePreRequestScripts(
  requestId: string,
  collectionId: string,
  workspaceId?: string,
): Promise<boolean> {
  const request = requestsRepo.findById(requestId)
  if (!request?.scripts) return true

  let scripts: ScriptsConfig
  try {
    scripts = JSON.parse(request.scripts)
  } catch {
    return true
  }

  if (!scripts.pre_request) {
    logHttp('pre-script', requestId, 'No pre-request scripts found')
    return true
  }

  // Each top-level call gets its own execution stack for circular-dependency detection
  const stack: string[] = []

  for (const script of Array.isArray(scripts.pre_request) ? scripts.pre_request : [scripts.pre_request]) {
    if (script.action !== 'send_request' || !script.request_id) continue
    logHttp('pre-script', requestId, `Firing dependent request: ${script.request_id}`)
    await executeDependentRequest(script.request_id, collectionId, workspaceId, stack)
    logHttp('pre-script', requestId, 'Dependent request completed')
  }

  return true
}

/**
 * Execute post-response scripts — extract values and set collection variables.
 */
export function executePostResponseScripts(
  requestId: string,
  collectionId: string,
  response: ResponseData,
  workspaceId?: string,
): void {
  const request = requestsRepo.findById(requestId)
  if (!request?.scripts) return

  let scripts: ScriptsConfig
  try {
    scripts = JSON.parse(request.scripts)
  } catch {
    return
  }

  if (!scripts.post_response) return

  for (const script of scripts.post_response) {
    if (script.action !== 'set_variable' || !script.source || !script.target) continue

    const rawValue = extractValue(script.source, response.status, response.body, response.headers)
    // Sanitize: strip {{...}} template patterns from server-controlled values
    // to prevent nested variable injection that could exfiltrate secrets
    const value = rawValue !== null ? rawValue.replace(/\{\{[\w\-.]+\}\}/g, '') : null
    logHttp('post-script', requestId, `Extract "${script.source}" → ${value !== null ? `"${value.slice(0, 50)}..."` : 'null'}, target: "${script.target}"`)
    if (value !== null) {
      setCollectionVariable(collectionId, script.target, value)
      mirrorToActiveEnvironment(collectionId, script.target, value, workspaceId)
      logHttp('post-script', requestId, `Variable "${script.target}" set successfully`)
    } else {
      logHttp('post-script', requestId, `Failed to extract "${script.source}" from response`, false)
    }
  }
}

/**
 * Execute a dependent request with circular dependency detection and depth limit.
 */
async function executeDependentRequest(
  requestId: string,
  collectionId: string,
  workspaceId: string | undefined,
  stack: string[],
): Promise<void> {
  if (stack.includes(requestId)) {
    throw new Error('Circular dependency detected in request scripts')
  }

  if (stack.length >= DEFAULTS.MAX_SCRIPT_CHAIN_DEPTH) {
    throw new Error(`Maximum script chain depth (${DEFAULTS.MAX_SCRIPT_CHAIN_DEPTH}) exceeded`)
  }

  const request = requestsRepo.findById(requestId)
  if (!request || request.collection_id !== collectionId) {
    throw new Error(`Dependent request [${requestId}] not found in this collection`)
  }

  stack.push(requestId)

  try {
    // Execute the HTTP request
    const response = await executeHttpRequest(requestId, collectionId, workspaceId)
    logHttp('pre-script', requestId, `Dependent request returned ${response.status} ${response.statusText}`)

    // Run post-response scripts
    executePostResponseScripts(requestId, collectionId, response, workspaceId)
  } finally {
    stack.pop()
  }
}

/**
 * Execute an HTTP request from saved request data (for dependent request scripts).
 */
async function executeHttpRequest(
  requestId: string,
  collectionId: string,
  workspaceId?: string,
): Promise<ResponseData> {
  const request = requestsRepo.findById(requestId)
  if (!request) throw new Error(`Request [${requestId}] not found`)

  const sub = (text: string): string => substitute(text, workspaceId, collectionId)
  const resolvedUrl = sub(request.url)

  // Build headers
  const headers: Record<string, string> = {}
  if (request.headers) {
    try {
      const parsed = JSON.parse(request.headers) as { key: string; value: string; enabled: boolean }[]
      for (const h of parsed) {
        if (h.enabled && h.key.trim()) {
          headers[sub(h.key)] = sub(h.value)
        }
      }
    } catch { /* ignore */ }
  }

  // Build body
  let body: string | undefined
  if (request.body && request.body_type !== 'none') {
    if (request.body_type === 'urlencoded') {
      // Parse URL-encoded params, substitute variables in decoded key/values, re-encode
      const params = new URLSearchParams(request.body)
      const resolved = new URLSearchParams()
      for (const [k, v] of params) {
        resolved.append(sub(k), sub(v))
      }
      body = resolved.toString()
    } else if (request.body_type === 'graphql') {
      body = JSON.stringify({ query: sub(request.body) })
    } else {
      body = sub(request.body)
    }
  }

  // Apply auth config (same logic as renderer's implicitHeaders)
  if (request.auth) {
    try {
      const auth = JSON.parse(request.auth) as import('../../shared/types/models').AuthConfig
      const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
      if (!hasAuth) {
        if (auth.type === 'bearer' && auth.bearer_token) {
          headers['Authorization'] = `Bearer ${sub(auth.bearer_token)}`
        } else if (auth.type === 'basic' && auth.basic_username) {
          headers['Authorization'] = `Basic ${Buffer.from(`${sub(auth.basic_username)}:${sub(auth.basic_password ?? '')}`).toString('base64')}`
        } else if (auth.type === 'api-key' && auth.api_key_header) {
          headers[sub(auth.api_key_header)] = sub(auth.api_key_value ?? '')
        }
      }
    } catch { /* ignore */ }
  }

  // Set content-type if not already set
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
  if (!hasContentType && body) {
    if (request.body_type === 'json') headers['Content-Type'] = 'application/json'
    else if (request.body_type === 'xml') headers['Content-Type'] = 'application/xml'
    else if (request.body_type === 'urlencoded') headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  // Read SSL setting (same as main proxy)
  const verifySsl = settingsRepo.getSetting('request.verify_ssl') !== 'false'
  const dispatcher = !verifySsl
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined

  const fetchOptions: Parameters<typeof undiciFetch>[1] = {
    method: request.method as any,
    headers,
    dispatcher,
  }

  if (request.method !== 'GET' && request.method !== 'HEAD' && body) {
    fetchOptions.body = body
  }

  logHttp('pre-script', requestId, `→ ${request.method} ${request.url}`)

  const startTime = performance.now()

  try {
    const response = await undiciFetch(resolvedUrl, fetchOptions)
    const ttfb = performance.now() - startTime
    const bodyBuffer = await response.arrayBuffer()
    const total = performance.now() - startTime
    const responseBody = new TextDecoder().decode(bodyBuffer)

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      size: bodyBuffer.byteLength,
      timing: { start: startTime, ttfb, total },
      cookies: [],
    }
  } catch (error) {
    const total = performance.now() - startTime
    return {
      status: 0,
      statusText: error instanceof Error ? error.message : 'Request failed',
      headers: {},
      body: String(error),
      size: 0,
      timing: { start: startTime, ttfb: total, total },
      cookies: [],
    }
  }
}

/**
 * Extract a value from a response using a source expression.
 * Supported: "status", "header.Name", "body.key.nested[0].id"
 */
export function extractValue(
  source: string,
  statusCode: number,
  body: string | null,
  headers: Record<string, string>,
): string | null {
  if (source === 'status') {
    return String(statusCode)
  }

  if (source.startsWith('header.')) {
    const headerName = source.slice(7)
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === headerName.toLowerCase()) {
        return value
      }
    }
    return null
  }

  if (source.startsWith('body.')) {
    const path = source.slice(5)
    try {
      const decoded = JSON.parse(body ?? '')
      if (typeof decoded !== 'object' || decoded === null) return null
      return extractJsonPath(decoded, path)
    } catch {
      return null
    }
  }

  return null
}

/**
 * Extract a value from a JSON structure using dot-notation with array index support.
 * e.g. "data.items[0].name" → ["data", "items", 0, "name"]
 */
export function extractJsonPath(data: unknown, path: string): string | null {
  const segments: (string | number)[] = []
  for (const part of path.split('.')) {
    const match = part.match(/^(.+?)\[(\d+)\]$/)
    if (match) {
      segments.push(match[1])
      segments.push(parseInt(match[2], 10))
    } else {
      segments.push(part)
    }
  }

  let current: unknown = data
  for (const segment of segments) {
    if (current === null || current === undefined) return null
    if (typeof current === 'object' && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string | number, unknown>)[segment]
    } else {
      return null
    }
  }

  if (current === null || current === undefined) return null
  if (typeof current === 'object') return JSON.stringify(current)
  return String(current)
}

/**
 * Set a collection variable (add or update).
 */
function setCollectionVariable(collectionId: string, key: string, value: string): void {
  const collection = collectionsRepo.findById(collectionId)
  if (!collection) return

  let variables: Record<string, string> = {}
  if (collection.variables) {
    try {
      const parsed = JSON.parse(collection.variables)
      if (Array.isArray(parsed)) {
        // EnvironmentVariable[] format — convert to Record
        for (const v of parsed) {
          if (v.key) variables[v.key] = v.value ?? ''
        }
      } else {
        variables = parsed
      }
    } catch { /* ignore */ }
  }

  variables[key] = value
  collectionsRepo.update(collectionId, { variables: JSON.stringify(variables) })
}

/**
 * If the active environment has a variable with the same key, update it too.
 */
function mirrorToActiveEnvironment(
  collectionId: string,
  key: string,
  value: string,
  workspaceId?: string,
): void {
  const collection = collectionsRepo.findById(collectionId)
  if (!collection) return

  const activeEnv = environmentsRepo.findActive(workspaceId ?? collection.workspace_id ?? undefined)
  if (!activeEnv) return

  try {
    const variables = JSON.parse(activeEnv.variables) as { key: string; value: string; enabled: boolean }[]
    let found = false
    for (const v of variables) {
      if (v.key === key) {
        v.value = value
        found = true
        break
      }
    }

    // Only update if the key already exists in the environment
    if (!found) return

    environmentsRepo.update(activeEnv.id, { variables: JSON.stringify(variables) })
  } catch { /* ignore */ }
}
