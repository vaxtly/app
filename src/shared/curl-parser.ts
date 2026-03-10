/**
 * Pure cURL command parser. Parses a cURL string into structured request data.
 * No Node.js or Electron dependencies — safe for use in both main and renderer.
 */

import type { KeyValueEntry, AuthConfig } from './types/models'
import type { BodyType } from './types/http'

export interface ParsedCurl {
  method: string
  url: string
  headers: KeyValueEntry[]
  queryParams: KeyValueEntry[]
  body: string | null
  body_type: BodyType
  auth: AuthConfig | null
}

/**
 * Detects whether a string looks like a cURL command.
 */
export function isCurlCommand(input: string): boolean {
  return /^\s*curl\s/i.test(input)
}

/**
 * Parse a cURL command string into structured request data.
 * Handles: -X, -H, -d, --data-raw, --data-binary, --data-urlencode, -F, -u, -A, -b
 */
export function parseCurl(input: string): ParsedCurl {
  const tokens = tokenize(input)

  let method: string | null = null
  let url: string | null = null
  const headers: KeyValueEntry[] = []
  const dataEntries: string[] = []
  const urlEncodedEntries: string[] = []
  const formEntries: string[] = []
  let auth: AuthConfig | null = null

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]

    // Skip the 'curl' command itself
    if (i === 0 && token.toLowerCase() === 'curl') {
      i++
      continue
    }

    // -X / --request METHOD
    if (token === '-X' || token === '--request') {
      method = tokens[++i]?.toUpperCase() ?? 'GET'
      i++
      continue
    }

    // -H / --header 'Key: Value'
    if (token === '-H' || token === '--header') {
      const headerStr = tokens[++i]
      if (headerStr) {
        const colonIdx = headerStr.indexOf(':')
        if (colonIdx > 0) {
          headers.push({
            key: headerStr.slice(0, colonIdx).trim(),
            value: headerStr.slice(colonIdx + 1).trim(),
            enabled: true,
          })
        }
      }
      i++
      continue
    }

    // -d / --data / --data-raw / --data-binary
    if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      const data = tokens[++i]
      if (data != null) dataEntries.push(data)
      i++
      continue
    }

    // --data-urlencode 'key=value'
    if (token === '--data-urlencode') {
      const data = tokens[++i]
      if (data != null) urlEncodedEntries.push(data)
      i++
      continue
    }

    // -F / --form 'key=value'
    if (token === '-F' || token === '--form') {
      const data = tokens[++i]
      if (data != null) formEntries.push(data)
      i++
      continue
    }

    // -u / --user 'user:password'
    if (token === '-u' || token === '--user') {
      const userPass = tokens[++i]
      if (userPass) {
        const colonIdx = userPass.indexOf(':')
        if (colonIdx >= 0) {
          auth = {
            type: 'basic',
            basic_username: userPass.slice(0, colonIdx),
            basic_password: userPass.slice(colonIdx + 1),
          }
        } else {
          auth = { type: 'basic', basic_username: userPass, basic_password: '' }
        }
      }
      i++
      continue
    }

    // -A / --user-agent 'agent'
    if (token === '-A' || token === '--user-agent') {
      const agent = tokens[++i]
      if (agent) {
        headers.push({ key: 'User-Agent', value: agent, enabled: true })
      }
      i++
      continue
    }

    // -b / --cookie 'cookies'
    if (token === '-b' || token === '--cookie') {
      const cookie = tokens[++i]
      if (cookie) {
        headers.push({ key: 'Cookie', value: cookie, enabled: true })
      }
      i++
      continue
    }

    // -e / --referer
    if (token === '-e' || token === '--referer') {
      const referer = tokens[++i]
      if (referer) {
        headers.push({ key: 'Referer', value: referer, enabled: true })
      }
      i++
      continue
    }

    // Boolean flags (skip silently)
    if (
      token === '-L' || token === '--location' ||
      token === '-k' || token === '--insecure' ||
      token === '-s' || token === '--silent' ||
      token === '-S' || token === '--show-error' ||
      token === '-v' || token === '--verbose' ||
      token === '-i' || token === '--include' ||
      token === '--compressed' ||
      token === '-g' || token === '--globoff'
    ) {
      i++
      continue
    }

    // Combined short flags like -sSL, -kL
    if (/^-[a-zA-Z]{2,}$/.test(token) && !token.startsWith('--')) {
      i++
      continue
    }

    // Flags with values we don't use (skip flag + value)
    if (
      token === '-o' || token === '--output' ||
      token === '-w' || token === '--write-out' ||
      token === '--connect-timeout' ||
      token === '-m' || token === '--max-time' ||
      token === '--retry' ||
      token === '-x' || token === '--proxy' ||
      token === '--cacert' || token === '--cert' || token === '--key'
    ) {
      i += 2
      continue
    }

    // Anything else that's not a flag is treated as the URL
    if (!token.startsWith('-')) {
      url = token
      i++
      continue
    }

    // Unknown flag — skip
    i++
  }

  // Determine body and body_type
  let body: string | null = null
  let body_type: BodyType = 'none'

  if (formEntries.length > 0) {
    // Form data: -F entries become KeyValueEntry[]
    const entries = formEntries.map((entry) => {
      const eqIdx = entry.indexOf('=')
      if (eqIdx >= 0) {
        return { key: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1), type: 'text' as const, enabled: true }
      }
      return { key: entry, value: '', type: 'text' as const, enabled: true }
    })
    body = JSON.stringify(entries)
    body_type = 'form-data'
  } else if (urlEncodedEntries.length > 0) {
    // --data-urlencode entries
    const entries = urlEncodedEntries.map((entry) => {
      const eqIdx = entry.indexOf('=')
      if (eqIdx >= 0) {
        return { key: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1), enabled: true }
      }
      return { key: entry, value: '', enabled: true }
    })
    body = JSON.stringify(entries)
    body_type = 'urlencoded'
  } else if (dataEntries.length > 0) {
    const rawBody = dataEntries.join('&')
    body_type = detectBodyType(rawBody, headers)
    body = rawBody
  }

  // Extract auth from Authorization header if not already set via -u
  if (!auth) {
    const authHeaderIdx = headers.findIndex((h) => h.key.toLowerCase() === 'authorization')
    if (authHeaderIdx >= 0) {
      const authHeader = headers[authHeaderIdx]
      const parsed = parseAuthHeader(authHeader.value)
      if (parsed) {
        auth = parsed
        headers.splice(authHeaderIdx, 1)
      }
    }
  }

  // Infer method: POST if body present and no explicit method
  if (!method) {
    method = (body != null) ? 'POST' : 'GET'
  }

  // Strip query params from URL into headers array (keep URL clean)
  let cleanUrl = url ?? ''
  const queryParams: KeyValueEntry[] = []

  if (cleanUrl) {
    try {
      const urlObj = new URL(cleanUrl)
      urlObj.searchParams.forEach((value, key) => {
        queryParams.push({ key, value, enabled: true })
      })
      if (urlObj.search) {
        cleanUrl = cleanUrl.split('?')[0]
      }
    } catch {
      // If URL can't be parsed (e.g. contains {{variables}}), try manual extraction
      const qIdx = cleanUrl.indexOf('?')
      if (qIdx >= 0) {
        const queryString = cleanUrl.slice(qIdx + 1)
        cleanUrl = cleanUrl.slice(0, qIdx)
        for (const param of queryString.split('&')) {
          const eqIdx = param.indexOf('=')
          if (eqIdx >= 0) {
            queryParams.push({
              key: decodeURIComponent(param.slice(0, eqIdx)),
              value: decodeURIComponent(param.slice(eqIdx + 1)),
              enabled: true,
            })
          } else if (param) {
            queryParams.push({ key: decodeURIComponent(param), value: '', enabled: true })
          }
        }
      }
    }
  }

  // Remove Content-Type header if we auto-detected the body type
  // (RequestBuilder will generate it from body_type)
  if (body_type !== 'none' && body_type !== 'raw') {
    const ctIdx = headers.findIndex((h) => h.key.toLowerCase() === 'content-type')
    if (ctIdx >= 0) headers.splice(ctIdx, 1)
  }

  return {
    method,
    url: cleanUrl,
    headers,
    queryParams,
    body,
    body_type,
    auth,
  }
}

/**
 * Detect body type from raw body content and headers.
 */
function detectBodyType(body: string, headers: KeyValueEntry[]): BodyType {
  const ct = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value?.toLowerCase() ?? ''

  if (ct.includes('application/json')) return 'json'
  if (ct.includes('application/xml') || ct.includes('text/xml')) return 'xml'
  if (ct.includes('application/x-www-form-urlencoded')) return 'urlencoded'
  if (ct.includes('multipart/form-data')) return 'form-data'

  // No Content-Type header: heuristic detection
  const trimmed = body.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return 'json' } catch { /* not json */ }
  }
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return 'xml'

  return 'raw'
}

/**
 * Parse Authorization header value into AuthConfig.
 */
function parseAuthHeader(value: string): AuthConfig | null {
  const trimmed = value.trim()

  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return { type: 'bearer', bearer_token: trimmed.slice(7).trim() }
  }

  if (trimmed.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = atob(trimmed.slice(6).trim())
      const colonIdx = decoded.indexOf(':')
      if (colonIdx >= 0) {
        return {
          type: 'basic',
          basic_username: decoded.slice(0, colonIdx),
          basic_password: decoded.slice(colonIdx + 1),
        }
      }
    } catch { /* not valid base64 */ }
  }

  return null
}

/**
 * Tokenize a cURL command string, handling:
 * - Single and double quotes
 * - Backslash line continuations
 * - $'...' ANSI-C quoting
 * - Escaped characters within quotes
 */
function tokenize(input: string): string[] {
  // Normalize line continuations (\ followed by newline)
  const normalized = input.replace(/\\\s*\n\s*/g, ' ').trim()

  const tokens: string[] = []
  let i = 0

  while (i < normalized.length) {
    // Skip whitespace
    while (i < normalized.length && /\s/.test(normalized[i])) i++
    if (i >= normalized.length) break

    const char = normalized[i]

    // $'...' — ANSI-C quoting
    if (char === '$' && normalized[i + 1] === "'") {
      i += 2
      let token = ''
      while (i < normalized.length && normalized[i] !== "'") {
        if (normalized[i] === '\\' && i + 1 < normalized.length) {
          const next = normalized[i + 1]
          if (next === 'n') { token += '\n'; i += 2 }
          else if (next === 't') { token += '\t'; i += 2 }
          else if (next === '\\') { token += '\\'; i += 2 }
          else if (next === "'") { token += "'"; i += 2 }
          else { token += next; i += 2 }
        } else {
          token += normalized[i]
          i++
        }
      }
      i++ // skip closing quote
      tokens.push(token)
      continue
    }

    // Single-quoted string
    if (char === "'") {
      i++
      let token = ''
      while (i < normalized.length && normalized[i] !== "'") {
        token += normalized[i]
        i++
      }
      i++ // skip closing quote
      tokens.push(token)
      continue
    }

    // Double-quoted string
    if (char === '"') {
      i++
      let token = ''
      while (i < normalized.length && normalized[i] !== '"') {
        if (normalized[i] === '\\' && i + 1 < normalized.length) {
          const next = normalized[i + 1]
          if (next === '"' || next === '\\' || next === '$' || next === '`') {
            token += next
            i += 2
          } else {
            token += normalized[i]
            i++
          }
        } else {
          token += normalized[i]
          i++
        }
      }
      i++ // skip closing quote
      tokens.push(token)
      continue
    }

    // Unquoted token
    let token = ''
    while (i < normalized.length && !/\s/.test(normalized[i])) {
      if (normalized[i] === '\\' && i + 1 < normalized.length) {
        token += normalized[i + 1]
        i += 2
      } else {
        token += normalized[i]
        i++
      }
    }
    tokens.push(token)
  }

  return tokens
}
