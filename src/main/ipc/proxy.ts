import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { Agent, fetch as undiciFetch, FormData as UndiciFormData } from 'undici'
import { IPC } from '../../shared/types/ipc'
import type { RequestConfig, ResponseData, FormDataEntry, ResponseCookie } from '../../shared/types/http'
import { substitute } from '../services/variable-substitution'
import { executePreRequestScripts, executePostResponseScripts } from '../services/script-execution'
import { logHttp } from '../services/session-log'
import { formatFetchError } from '../services/fetch-error'
import { DEFAULTS } from '../../shared/constants'
import type { HttpLogDetail } from '../../shared/types/sync'
import * as requestsRepo from '../database/repositories/requests'
import * as environmentsRepo from '../database/repositories/environments'
import * as settingsRepo from '../database/repositories/settings'
import * as vaultSyncService from '../vault/vault-sync-service'
import { isTokenExpired, refreshAccessToken } from '../services/oauth2'
import type { AuthConfig } from '../../shared/types/models'

function truncateBody(body: string | undefined): string | undefined {
  if (!body) return undefined
  if (body.length <= DEFAULTS.SESSION_LOG_BODY_MAX_SIZE) return body
  return body.slice(0, DEFAULTS.SESSION_LOG_BODY_MAX_SIZE) + '\n--- Truncated ---'
}

function parseQueryParams(url: string): Record<string, string> | undefined {
  try {
    const params: Record<string, string> = {}
    const searchParams = new URL(url).searchParams
    searchParams.forEach((value, key) => { params[key] = value })
    return Object.keys(params).length > 0 ? params : undefined
  } catch {
    return undefined
  }
}

const activeRequests = new Map<string, AbortController>()
const approvedFilePaths = new Set<string>()

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const ALLOWED_SCHEMES = new Set(['http:', 'https:'])
const MAX_BODY_SIZE = 50 * 1024 * 1024 // 50 MB

export function registerProxyHandlers(): void {
  ipcMain.handle(IPC.PROXY_SEND, async (_event, requestId: string, config: RequestConfig): Promise<ResponseData> => {
    const startTime = performance.now()
    let ttfb = 0

    // Set up abort controller
    const controller = new AbortController()
    activeRequests.set(requestId, controller)

    // Execute pre-request scripts BEFORE variable substitution
    // so dependent requests can set variables (e.g. auth tokens) that this request uses
    if (config.collectionId) {
      try {
        await executePreRequestScripts(requestId, config.collectionId, config.workspaceId)
      } catch (error) {
        logHttp('pre-script', config.url, `Pre-request script failed: ${error instanceof Error ? error.message : String(error)}`, false)
      }
    }

    // Ensure vault secrets are in-memory before substitution
    const activeEnv = environmentsRepo.findActive(config.workspaceId)
    if (activeEnv?.vault_synced === 1) {
      try {
        await vaultSyncService.ensureLoaded(activeEnv.id, config.workspaceId)
      } catch (e) {
        logHttp('vault', config.url, `Failed to load vault secrets: ${e instanceof Error ? e.message : String(e)}`, false)
      }
    }

    // Auto-refresh OAuth2 token if expired
    const currentRequest = requestsRepo.findById(requestId)
    if (currentRequest?.auth) {
      try {
        const auth = JSON.parse(currentRequest.auth) as AuthConfig
        if (auth.type === 'oauth2' && auth.oauth2_access_token && isTokenExpired(auth)) {
          const refreshed = await refreshAccessToken(auth)
          const updatedAuth: AuthConfig = { ...auth, ...refreshed }
          requestsRepo.update(requestId, { auth: JSON.stringify(updatedAuth) })
          logHttp('oauth2', config.url, 'Token auto-refreshed before request')
        }
      } catch (e) {
        logHttp('oauth2', config.url, `Token refresh failed: ${e instanceof Error ? e.message : String(e)}`, false)
      }
    }

    // Substitute {{variables}} in URL, headers, body (after pre-request scripts have run)
    const sub = (text: string | undefined): string | undefined =>
      text ? substitute(text, config.workspaceId, config.collectionId) : text
    const resolvedUrl = substitute(config.url, config.workspaceId, config.collectionId)
    const resolvedHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(config.headers)) {
      resolvedHeaders[sub(key)!] = sub(value)!
    }
    const resolvedBody = sub(config.body)

    // Validate HTTP method
    const method = config.method.toUpperCase()
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error(`Unsupported HTTP method: ${config.method}`)
    }

    // Validate URL scheme
    try {
      const parsedUrl = new URL(resolvedUrl)
      if (!ALLOWED_SCHEMES.has(parsedUrl.protocol)) {
        throw new Error(`Unsupported URL scheme: ${parsedUrl.protocol} (only http/https allowed)`)
      }
    } catch (e) {
      if (e instanceof TypeError) throw new Error(`Invalid URL: ${resolvedUrl}`)
      throw e
    }

    // Read settings
    const verifySsl = config.verifySsl ?? (settingsRepo.getSetting('request.verify_ssl') !== 'false')
    const followRedirects = config.followRedirects ?? (settingsRepo.getSetting('request.follow_redirects') !== 'false')
    const rawTimeout = config.timeout ?? Number(settingsRepo.getSetting('request.timeout') || '30')
    const timeoutSec = Math.max(1, Math.min(300, rawTimeout))

    // Set up timeout
    const timeoutMs = timeoutSec * 1000
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const fetchHeaders = { ...resolvedHeaders }

      // Use undici Agent — optionally disable SSL verification
      const dispatcher = !verifySsl
        ? new Agent({ connect: { rejectUnauthorized: false } })
        : undefined

      // Build request body
      let fetchBody: any = undefined

      if (method !== 'GET' && method !== 'HEAD') {
        if (config.bodyType === 'json' && resolvedBody) {
          fetchBody = resolvedBody
          setDefaultHeader(fetchHeaders, 'Content-Type', 'application/json')
        } else if (config.bodyType === 'xml' && resolvedBody) {
          fetchBody = resolvedBody
          setDefaultHeader(fetchHeaders, 'Content-Type', 'application/xml')
        } else if (config.bodyType === 'form-data' && config.formData) {
          // Substitute variables in form-data text values
          const resolvedFormData = config.formData.map((e) => ({
            ...e,
            type: e.type || 'text',
            key: sub(e.key)!,
            value: e.type === 'file' ? e.value : (sub(e.value) ?? e.value),
          }))
          const formBody = new UndiciFormData()
          for (const entry of resolvedFormData) {
            if (!entry.enabled) continue
            if (entry.type === 'file' && entry.filePath) {
              if (!approvedFilePaths.has(entry.filePath)) {
                throw new Error(`File path not approved by file picker: ${basename(entry.filePath)}`)
              }
              const buffer = readFileSync(entry.filePath)
              const blob = new Blob([buffer])
              formBody.append(entry.key, blob, entry.fileName ?? basename(entry.filePath))
            } else {
              formBody.append(entry.key, entry.value ?? '')
            }
          }
          fetchBody = formBody
          // Remove Content-Type so undici sets multipart boundary automatically
          deleteHeader(fetchHeaders, 'Content-Type')
          // Form-data body: template entries stored in history via config.formData
        } else if (config.bodyType === 'urlencoded' && resolvedBody) {
          // Parse, substitute variables in each key/value, re-encode
          const params = new URLSearchParams(resolvedBody)
          const resolved = new URLSearchParams()
          for (const [k, v] of params) {
            resolved.append(sub(k) ?? k, sub(v) ?? v)
          }
          fetchBody = resolved.toString()
          setDefaultHeader(fetchHeaders, 'Content-Type', 'application/x-www-form-urlencoded')
        } else if (config.bodyType === 'graphql' && resolvedBody) {
          fetchBody = resolvedBody
          setDefaultHeader(fetchHeaders, 'Content-Type', 'application/json')
        } else if (config.bodyType === 'raw' && resolvedBody) {
          fetchBody = resolvedBody
        }
      }

      const response = await undiciFetch(resolvedUrl, {
        method,
        headers: fetchHeaders,
        body: fetchBody,
        redirect: followRedirects ? 'follow' : 'manual',
        signal: controller.signal,
        dispatcher,
      } as any)
      clearTimeout(timeoutId)
      ttfb = performance.now() - startTime

      // Check content-length before downloading body
      const contentLength = parseInt(response.headers.get('content-length') ?? '', 10)
      if (contentLength > MAX_BODY_SIZE) {
        await response.body?.cancel()
        throw new Error(`Response body too large (${Math.round(contentLength / 1024 / 1024)}MB, max 50MB)`)
      }

      const bodyBuffer = await response.arrayBuffer()
      const total = performance.now() - startTime
      const body = new TextDecoder().decode(bodyBuffer)

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      const cookies = parseCookies(response.headers)

      const result: ResponseData = {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
        size: bodyBuffer.byteLength,
        timing: { start: startTime, ttfb, total },
        cookies,
      }

      // Execute post-response scripts (extract values, set variables)
      if (config.collectionId) {
        try {
          executePostResponseScripts(requestId, config.collectionId, result, config.workspaceId)
        } catch (error) {
          logHttp('post-script', resolvedUrl, `Post-response script failed: ${error instanceof Error ? error.message : String(error)}`, false)
        }
      }

      const detail: HttpLogDetail = {
        request: {
          method,
          url: resolvedUrl,
          headers: fetchHeaders,
          ...(typeof fetchBody === 'string' && { body: truncateBody(fetchBody) }),
          ...(config.bodyType && config.bodyType !== 'none' && { bodyType: config.bodyType }),
          ...({ queryParams: parseQueryParams(resolvedUrl) }),
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers,
          body: truncateBody(body),
          size: bodyBuffer.byteLength,
          timing: { ttfb: Math.round(ttfb), total: Math.round(total) },
          ...(cookies.length > 0 && { cookies: cookies.map(c => ({ name: c.name, value: c.value })) }),
        },
      }

      logHttp('request', resolvedUrl, `${method} ${response.status} ${response.statusText} (${Math.round(total)}ms)`, true, detail)

      return result
    } catch (error) {
      clearTimeout(timeoutId)
      const total = performance.now() - startTime
      const errorMessage = formatFetchError(error, resolvedUrl)

      const failDetail: HttpLogDetail = {
        request: {
          method,
          url: resolvedUrl,
          headers: resolvedHeaders,
          ...(typeof resolvedBody === 'string' && { body: truncateBody(resolvedBody) }),
          ...(config.bodyType && config.bodyType !== 'none' && { bodyType: config.bodyType }),
          ...({ queryParams: parseQueryParams(resolvedUrl) }),
        },
        response: {
          status: 0,
          statusText: errorMessage,
          headers: {},
          size: 0,
          timing: { ttfb: Math.round(ttfb || total), total: Math.round(total) },
        },
      }

      logHttp('request', resolvedUrl, `${method} failed: ${errorMessage}`, false, failDetail)
      return {
        status: 0,
        statusText: errorMessage,
        headers: {},
        body: error instanceof Error ? error.message : String(error),
        size: 0,
        timing: { start: startTime, ttfb: ttfb || total, total },
        cookies: [],
      }
    } finally {
      activeRequests.delete(requestId)
    }
  })

  ipcMain.handle(IPC.PROXY_CANCEL, (_event, requestId: string) => {
    const controller = activeRequests.get(requestId)
    if (controller) {
      controller.abort()
      activeRequests.delete(requestId)
    }
  })

  ipcMain.handle(IPC.PROXY_PICK_FILE, async (): Promise<{ path: string; name: string } | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    approvedFilePaths.add(filePath)
    return { path: filePath, name: basename(filePath) }
  })
}

export function setDefaultHeader(headers: Record<string, string>, name: string, value: string): void {
  const lower = name.toLowerCase()
  const exists = Object.keys(headers).some((k) => k.toLowerCase() === lower)
  if (!exists) {
    headers[name] = value
  }
}

export function deleteHeader(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key]
    }
  }
}


export function parseCookies(headers: Headers): ResponseCookie[] {
  const cookies: ResponseCookie[] = []
  const setCookie = headers.getSetCookie?.()
  if (!setCookie) return cookies

  for (const raw of setCookie) {
    const parts = raw.split(';').map((s) => s.trim())
    const [nameValue, ...attrs] = parts
    const eqIndex = nameValue.indexOf('=')
    if (eqIndex < 0) continue

    const cookie: ResponseCookie = {
      name: nameValue.substring(0, eqIndex),
      value: nameValue.substring(eqIndex + 1),
    }

    for (const attr of attrs) {
      const [aKey, ...aVal] = attr.split('=')
      const key = aKey.trim().toLowerCase()
      const val = aVal.join('=').trim()

      if (key === 'domain') cookie.domain = val
      else if (key === 'path') cookie.path = val
      else if (key === 'expires') cookie.expires = val
      else if (key === 'httponly') cookie.httpOnly = true
      else if (key === 'secure') cookie.secure = true
      else if (key === 'samesite') cookie.sameSite = val
    }

    cookies.push(cookie)
  }

  return cookies
}
