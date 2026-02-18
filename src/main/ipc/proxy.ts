import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { IPC } from '../../shared/types/ipc'
import type { RequestConfig, ResponseData, FormDataEntry, ResponseCookie } from '../../shared/types/http'
import { substitute } from '../services/variable-substitution'
import { executePreRequestScripts, executePostResponseScripts } from '../services/script-execution'
import { logHttp } from '../services/session-log'
import * as historiesRepo from '../database/repositories/request-histories'

const activeRequests = new Map<string, AbortController>()

export function registerProxyHandlers(): void {
  ipcMain.handle(IPC.PROXY_SEND, async (_event, requestId: string, config: RequestConfig): Promise<ResponseData> => {
    const startTime = performance.now()
    let ttfb = 0

    // Set up abort controller
    const controller = new AbortController()
    activeRequests.set(requestId, controller)

    // Substitute {{variables}} in URL, headers, body
    const sub = (text: string | undefined): string | undefined =>
      text ? substitute(text, config.workspaceId, config.collectionId) : text
    const resolvedUrl = substitute(config.url, config.workspaceId, config.collectionId)
    const resolvedHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(config.headers)) {
      resolvedHeaders[sub(key)!] = sub(value)!
    }
    const resolvedBody = sub(config.body)

    // Execute pre-request scripts (dependent requests)
    if (config.collectionId) {
      try {
        await executePreRequestScripts(requestId, config.collectionId, config.workspaceId)
      } catch (error) {
        logHttp('pre-script', resolvedUrl, `Pre-request script failed: ${error instanceof Error ? error.message : String(error)}`, false)
      }
    }

    try {
      const fetchOptions: RequestInit = {
        method: config.method,
        headers: { ...resolvedHeaders },
        redirect: config.followRedirects !== false ? 'follow' : 'manual',
        signal: controller.signal,
      }

      if (config.method !== 'GET' && config.method !== 'HEAD') {
        if (config.bodyType === 'json' && resolvedBody) {
          fetchOptions.body = resolvedBody
          setDefaultHeader(fetchOptions.headers as Record<string, string>, 'Content-Type', 'application/json')
        } else if (config.bodyType === 'xml' && resolvedBody) {
          fetchOptions.body = resolvedBody
          setDefaultHeader(fetchOptions.headers as Record<string, string>, 'Content-Type', 'application/xml')
        } else if (config.bodyType === 'form-data' && config.formData) {
          // Substitute variables in form-data text values
          const resolvedFormData = config.formData.map((e) =>
            e.type === 'text' ? { ...e, key: sub(e.key)!, value: sub(e.value)! } : { ...e, key: sub(e.key)! },
          )
          const formData = buildFormData(resolvedFormData)
          fetchOptions.body = formData
          // Let fetch set boundary
          deleteHeader(fetchOptions.headers as Record<string, string>, 'Content-Type')
        } else if (config.bodyType === 'urlencoded' && resolvedBody) {
          fetchOptions.body = resolvedBody
          setDefaultHeader(fetchOptions.headers as Record<string, string>, 'Content-Type', 'application/x-www-form-urlencoded')
        } else if (config.bodyType === 'graphql' && resolvedBody) {
          fetchOptions.body = resolvedBody
          setDefaultHeader(fetchOptions.headers as Record<string, string>, 'Content-Type', 'application/json')
        } else if (config.bodyType === 'raw' && resolvedBody) {
          fetchOptions.body = resolvedBody
        }
      }

      const response = await fetch(resolvedUrl, fetchOptions)
      ttfb = performance.now() - startTime

      const bodyBuffer = await response.arrayBuffer()
      const total = performance.now() - startTime
      const body = new TextDecoder().decode(bodyBuffer)

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      const cookies = parseCookies(response.headers)

      // Auto-save to request history
      try {
        historiesRepo.create({
          request_id: requestId,
          method: config.method,
          url: resolvedUrl,
          status_code: response.status,
          request_headers: JSON.stringify(resolvedHeaders),
          request_body: resolvedBody ?? undefined,
          response_body: body,
          response_headers: JSON.stringify(headers),
          duration_ms: Math.round(total),
        })
      } catch {
        // Don't fail the request if history save fails
      }

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

      logHttp('request', resolvedUrl, `${config.method} ${response.status} ${response.statusText} (${Math.round(total)}ms)`)

      return result
    } catch (error) {
      const total = performance.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Request failed'
      logHttp('request', resolvedUrl, `${config.method} failed: ${errorMessage}`, false)
      return {
        status: 0,
        statusText: errorMessage,
        headers: {},
        body: error instanceof Error ? error.stack || error.message : String(error),
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
    return { path: result.filePaths[0], name: basename(result.filePaths[0]) }
  })
}

function buildFormData(entries: FormDataEntry[]): FormData {
  const formData = new FormData()
  for (const entry of entries) {
    if (!entry.enabled) continue
    if (entry.type === 'file' && entry.filePath) {
      const buffer = readFileSync(entry.filePath)
      const blob = new Blob([buffer])
      formData.append(entry.key, blob, entry.fileName ?? basename(entry.filePath))
    } else {
      formData.append(entry.key, entry.value)
    }
  }
  return formData
}

function setDefaultHeader(headers: Record<string, string>, name: string, value: string): void {
  const lower = name.toLowerCase()
  const exists = Object.keys(headers).some((k) => k.toLowerCase() === lower)
  if (!exists) {
    headers[name] = value
  }
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key]
    }
  }
}

function parseCookies(headers: Headers): ResponseCookie[] {
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
