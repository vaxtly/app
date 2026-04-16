/**
 * Script execution service — handles pre-request and post-response scripts.
 *
 * Pre-request: fires a dependent request before the main request.
 * Post-response: extracts a value from the response and sets it as a collection variable.
 */

import { fetch as undiciFetch } from 'undici'
import { createUndiciDispatcher } from './tls-options'
import * as requestsRepo from '../database/repositories/requests'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as environmentsRepo from '../database/repositories/environments'
import * as settingsRepo from '../database/repositories/settings'
import { getCachedVariables, setCachedVariables, pushVariables as vaultPush } from '../vault/vault-sync-service'
import { substitute, getResolvedVariables } from './variable-substitution'
import { isTokenExpired, refreshAccessToken } from './oauth2'
import { DEFAULTS } from '../../shared/constants'
import { logHttp, logScript } from './session-log'
import { getCookieHeader, captureCookies } from './cookie-jar'
import { parseCookies } from '../ipc/proxy'
import type { ScriptsConfig, PreRequestScript, PostResponseScript, EnvironmentVariable } from '../../shared/types/models'
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
    logScript('pre', request.name, 'No pre-request scripts found')
    return true
  }

  // Each top-level call gets its own execution stack for circular-dependency detection
  const stack: string[] = []

  for (const script of Array.isArray(scripts.pre_request) ? scripts.pre_request : [scripts.pre_request]) {
    if (script.action !== 'send_request' || !script.request_id) continue
    const depName = requestsRepo.findById(script.request_id)?.name ?? script.request_id
    logScript('pre', request.name, `Firing dependent request: ${depName}`)
    await executeDependentRequest(script.request_id, collectionId, workspaceId, stack)
    logScript('pre', request.name, 'Dependent request completed')
  }

  return true
}

/**
 * Execute collection/folder-level pre-request scripts.
 * Walks: collection → root folder → ... → leaf folder (top-down).
 * Each script's skip_if_valid is checked before firing.
 */
export async function executeContainerPreRequestScripts(
  collectionId: string,
  folderId: string | null,
  workspaceId?: string,
): Promise<void> {
  const stack: string[] = []

  // 1. Collection scripts
  const collection = collectionsRepo.findById(collectionId)
  if (collection?.scripts) {
    try {
      const scripts: ScriptsConfig = JSON.parse(collection.scripts)
      await executeContainerScriptList(scripts, collectionId, workspaceId, stack, collection.name)
    } catch { /* ignore parse errors */ }
  }

  // 2. Folder chain scripts (top-down: root folder → leaf folder)
  if (folderId) {
    const chain: Array<{ id: string; name: string; scripts: string }> = []
    let currentId: string | null = folderId
    while (currentId) {
      const folder = foldersRepo.findById(currentId)
      if (!folder) break
      if (folder.scripts) {
        chain.unshift({ id: folder.id, name: folder.name, scripts: folder.scripts })
      }
      currentId = folder.parent_id
    }

    for (const entry of chain) {
      try {
        const scripts: ScriptsConfig = JSON.parse(entry.scripts)
        await executeContainerScriptList(scripts, collectionId, workspaceId, stack, entry.name)
      } catch { /* ignore parse errors */ }
    }
  }
}

async function executeContainerScriptList(
  scripts: ScriptsConfig,
  collectionId: string,
  workspaceId: string | undefined,
  stack: string[],
  ownerName: string,
): Promise<void> {
  if (!scripts.pre_request) return

  const preScripts = Array.isArray(scripts.pre_request) ? scripts.pre_request : [scripts.pre_request]
  let lastResponse: ResponseData | null = null

  for (const script of preScripts) {
    if (script.action !== 'send_request' || !script.request_id) continue

    // Check skip_if_valid — skip if token is still fresh
    if (shouldSkipPreRequest(script, collectionId, workspaceId)) {
      const tokenVar = script.skip_if_valid!.token_variable
      logScript('pre', ownerName, `Token "{{${tokenVar}}}" still valid, skipping dependent request`)
      continue
    }

    const depName = requestsRepo.findById(script.request_id)?.name ?? script.request_id
    logScript('pre', ownerName, `Firing dependent request: ${depName}`)
    lastResponse = await executeDependentRequest(script.request_id, collectionId, workspaceId, stack)
    logScript('pre', ownerName, 'Dependent request completed')
  }

  // Run container-level post-response scripts using the last dependent response
  if (scripts.post_response && lastResponse) {
    executeContainerPostResponseScripts(scripts.post_response, collectionId, lastResponse, ownerName, workspaceId)
  }
}

/**
 * Execute container-level post-response scripts (collection/folder).
 * Same as request-level but uses the container as the context name.
 */
function executeContainerPostResponseScripts(
  postScripts: PostResponseScript[],
  collectionId: string,
  response: ResponseData,
  ownerName: string,
  workspaceId?: string,
): void {
  for (const script of postScripts) {
    if (!script.source || !script.target) continue
    if (script.action !== 'set_variable' && script.action !== 'set_token_expiry') continue

    const rawValue = extractValue(script.source, response.status, response.body, response.headers)
    const value = rawValue !== null ? rawValue.replace(/\{\{[\w\-.]+\}\}/g, '') : null
    logScript('post', ownerName, `Extract "${script.source}" → ${value !== null ? `"${value.slice(0, 50)}..."` : 'null'}, target: "${script.target}"`)
    if (value !== null) {
      let finalValue = value
      if (script.action === 'set_token_expiry') {
        const seconds = Number(value)
        if (isNaN(seconds)) {
          logScript('post', ownerName, `"${script.source}" is not a number (${value}), cannot compute expiry`, false)
          continue
        }
        finalValue = String(Date.now() + seconds * 1000)
        logScript('post', ownerName, `Converted expires_in=${seconds}s to absolute timestamp ${finalValue}`)
      }
      setCollectionVariable(collectionId, script.target, finalValue)
      mirrorToActiveEnvironment(collectionId, script.target, finalValue, workspaceId)
      logScript('post', ownerName, `Variable "${script.target}" set successfully`)
    } else {
      logScript('post', ownerName, `Failed to extract "${script.source}" from response`, false)
    }
  }
}

function shouldSkipPreRequest(
  script: PreRequestScript,
  collectionId: string,
  workspaceId?: string,
): boolean {
  if (!script.skip_if_valid) return false
  const vars = getResolvedVariables(workspaceId, collectionId)
  const token = vars[script.skip_if_valid.token_variable]
  const expiresAt = vars[script.skip_if_valid.expires_at_variable]
  if (!token || !expiresAt) return false
  const expiresAtMs = Number(expiresAt)
  // 30-second safety margin (same as OAuth2 auto-refresh)
  return !isNaN(expiresAtMs) && Date.now() < expiresAtMs - 30_000
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
    if (!script.source || !script.target) continue
    if (script.action !== 'set_variable' && script.action !== 'set_token_expiry') continue

    const rawValue = extractValue(script.source, response.status, response.body, response.headers)
    // Sanitize: strip {{...}} template patterns from server-controlled values
    // to prevent nested variable injection that could exfiltrate secrets
    const value = rawValue !== null ? rawValue.replace(/\{\{[\w\-.]+\}\}/g, '') : null
    logScript('post', request.name, `Extract "${script.source}" → ${value !== null ? `"${value.slice(0, 50)}..."` : 'null'}, target: "${script.target}"`)
    if (value !== null) {
      let finalValue = value
      if (script.action === 'set_token_expiry') {
        const seconds = Number(value)
        if (isNaN(seconds)) {
          logScript('post', request.name, `"${script.source}" is not a number (${value}), cannot compute expiry`, false)
          continue
        }
        finalValue = String(Date.now() + seconds * 1000)
        logScript('post', request.name, `Converted expires_in=${seconds}s to absolute timestamp ${finalValue}`)
      }
      setCollectionVariable(collectionId, script.target, finalValue)
      mirrorToActiveEnvironment(collectionId, script.target, finalValue, workspaceId)
      logScript('post', request.name, `Variable "${script.target}" set successfully`)
    } else {
      logScript('post', request.name, `Failed to extract "${script.source}" from response`, false)
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
): Promise<ResponseData> {
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
    logScript('pre', request.name, `Dependent request returned ${response.status} ${response.statusText}`)

    // Run post-response scripts
    executePostResponseScripts(requestId, collectionId, response, workspaceId)
    return response
  } finally {
    stack.pop()
  }
}

/**
 * Execute an HTTP request from saved request data.
 * Used by dependent request scripts and the collection runner.
 */
export async function executeHttpRequest(
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
      // Body is stored as JSON entries array; serialize enabled ones to URLSearchParams
      try {
        const entries: { key: string; value: string; enabled: boolean }[] = JSON.parse(request.body)
        const params = new URLSearchParams()
        for (const e of entries) {
          if (e.enabled && e.key.trim()) params.append(sub(e.key), sub(e.value))
        }
        body = params.toString()
      } catch {
        // Fallback: legacy URLSearchParams format
        const params = new URLSearchParams(request.body)
        const resolved = new URLSearchParams()
        for (const [k, v] of params) {
          resolved.append(sub(k), sub(v))
        }
        body = resolved.toString()
      }
    } else if (request.body_type === 'graphql') {
      // Body may be JSON envelope or bare query (backward compat)
      try {
        const parsed = JSON.parse(request.body)
        if (parsed && typeof parsed.query === 'string') {
          body = JSON.stringify({ query: sub(parsed.query), variables: parsed.variables ?? {} })
        } else {
          body = JSON.stringify({ query: sub(request.body) })
        }
      } catch {
        body = JSON.stringify({ query: sub(request.body) })
      }
    } else {
      body = sub(request.body)
    }
  }

  // Apply auth config (same logic as renderer's implicitHeaders)
  if (request.auth) {
    try {
      let auth = JSON.parse(request.auth) as import('../../shared/types/models').AuthConfig

      // Auto-refresh OAuth2 token if expired
      if (auth.type === 'oauth2' && auth.oauth2_access_token && isTokenExpired(auth)) {
        try {
          const refreshed = await refreshAccessToken(auth)
          auth = { ...auth, ...refreshed }
          requestsRepo.update(requestId, { auth: JSON.stringify(auth) })
        } catch { /* ignore refresh failure */ }
      }

      const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
      if (!hasAuth) {
        if (auth.type === 'bearer' && auth.bearer_token) {
          headers['Authorization'] = `Bearer ${sub(auth.bearer_token)}`
        } else if (auth.type === 'basic' && auth.basic_username) {
          headers['Authorization'] = `Basic ${Buffer.from(`${sub(auth.basic_username)}:${sub(auth.basic_password ?? '')}`).toString('base64')}`
        } else if (auth.type === 'api-key' && auth.api_key_header) {
          headers[sub(auth.api_key_header)] = sub(auth.api_key_value ?? '')
        } else if (auth.type === 'oauth2' && auth.oauth2_access_token) {
          const tokenType = auth.oauth2_token_type ?? 'Bearer'
          headers['Authorization'] = `${tokenType} ${auth.oauth2_access_token}`
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

  // Inject cookies from cookie jar
  const sendCookies = settingsRepo.getSetting('request.send_cookies') !== 'false'
  if (sendCookies) {
    const cookieHeader = getCookieHeader(resolvedUrl)
    if (cookieHeader && !Object.keys(headers).some(k => k.toLowerCase() === 'cookie')) {
      headers['Cookie'] = cookieHeader
    }
  }

  // TLS: custom certs + SSL verification (same as main proxy)
  const verifySsl = settingsRepo.getSetting('request.verify_ssl') !== 'false'
  const dispatcher = createUndiciDispatcher(verifySsl, resolvedUrl)

  const fetchOptions: Parameters<typeof undiciFetch>[1] = {
    method: request.method as any,
    headers,
    dispatcher,
  }

  if (request.method !== 'GET' && request.method !== 'HEAD' && body) {
    fetchOptions.body = body
  }

  logScript('pre', request.name, `→ ${request.method} ${resolvedUrl}`)

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

    // Capture cookies into the cookie jar
    const cookies = parseCookies(response.headers)
    if (sendCookies) {
      captureCookies(resolvedUrl, cookies)
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      size: bodyBuffer.byteLength,
      timing: { start: startTime, ttfb, total },
      cookies,
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
 * For vault-synced environments, updates in-memory cache and pushes to Vault.
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
    if (activeEnv.vault_synced === 1) {
      // Vault-synced: update in-memory cache, push to Vault
      const cached = getCachedVariables(activeEnv.id)
      if (!cached) return

      const variables = [...cached]
      let found = false
      for (const v of variables) {
        if (v.key === key) {
          v.value = value
          found = true
          break
        }
      }

      if (!found) return

      setCachedVariables(activeEnv.id, variables)
      // Fire-and-forget push to Vault — log failures
      vaultPush(activeEnv.id, variables, workspaceId).catch((e) => {
        logScript('vault-push', activeEnv.name, `Vault push failed: ${e instanceof Error ? e.message : String(e)}`, false)
      })
    } else {
      const variables = JSON.parse(activeEnv.variables) as EnvironmentVariable[]
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
    }
  } catch { /* ignore */ }
}
