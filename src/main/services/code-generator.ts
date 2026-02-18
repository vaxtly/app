/**
 * Code generator service — generates code snippets from request data.
 * Languages: curl, Python (requests), PHP (Laravel HTTP), JavaScript (fetch), Node (axios).
 */

import { substitute } from './variable-substitution'

export interface CodeGenRequest {
  method: string
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  queryParams: { key: string; value: string; enabled: boolean }[]
  body: string
  bodyType: string
  formData: { key: string; value: string; enabled: boolean }[]
  authType: string
  authToken: string
  authUsername: string
  authPassword: string
  apiKeyName: string
  apiKeyValue: string
}

export type CodeLanguage = 'curl' | 'python' | 'php' | 'javascript' | 'node'

export function generateCode(
  language: CodeLanguage,
  data: CodeGenRequest,
  workspaceId?: string,
  collectionId?: string,
): string {
  const sub = (text: string): string => substitute(text, workspaceId, collectionId)

  const resolvedHeaders = buildHeaders(data, sub)
  const resolvedUrl = buildUrl(data, sub)
  const resolvedBody = buildBody(data, sub)

  switch (language) {
    case 'curl': return generateCurl(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    case 'python': return generatePython(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    case 'php': return generatePhp(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    case 'javascript': return generateJavascript(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    case 'node': return generateNode(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    default: return generateCurl(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
  }
}

function buildHeaders(data: CodeGenRequest, sub: (s: string) => string): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const h of data.headers) {
    if (h.key.trim() && h.enabled) {
      headers[sub(h.key)] = sub(h.value)
    }
  }

  // Auth headers
  if (data.authType === 'bearer' && data.authToken) {
    headers['Authorization'] = `Bearer ${sub(data.authToken)}`
  } else if (data.authType === 'basic' && data.authUsername) {
    const encoded = btoa(`${sub(data.authUsername)}:${sub(data.authPassword)}`)
    headers['Authorization'] = `Basic ${encoded}`
  } else if (data.authType === 'api-key' && data.apiKeyName && data.apiKeyValue) {
    headers[sub(data.apiKeyName)] = sub(data.apiKeyValue)
  }

  return headers
}

function buildUrl(data: CodeGenRequest, sub: (s: string) => string): string {
  let url = sub(data.url)
  const params: string[] = []

  for (const p of data.queryParams) {
    if (p.key.trim() && p.enabled) {
      params.push(`${encodeURIComponent(sub(p.key))}=${encodeURIComponent(sub(p.value))}`)
    }
  }

  if (params.length > 0) {
    url += (url.includes('?') ? '&' : '?') + params.join('&')
  }

  return url
}

function buildBody(data: CodeGenRequest, sub: (s: string) => string): string | null {
  const { bodyType, body, formData } = data

  switch (bodyType) {
    case 'json':
    case 'xml':
    case 'raw':
      return body ? sub(body) : null
    case 'form-data':
    case 'urlencoded': {
      const entries = formData.filter((f) => f.key.trim() && f.enabled)
      if (entries.length === 0) return null
      const obj: Record<string, string> = {}
      for (const f of entries) {
        obj[sub(f.key)] = sub(f.value)
      }
      return JSON.stringify(obj)
    }
    default:
      return null
  }
}

function esc(s: string): string {
  return s.replace(/'/g, "\\'")
}

// --- Language generators ---

function generateCurl(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toUpperCase()
  const parts = ['curl']

  if (m !== 'GET') parts.push(`-X ${m}`)
  parts.push(`'${esc(url)}'`)

  for (const [k, v] of Object.entries(headers)) {
    parts.push(`-H '${esc(`${k}: ${v}`)}'`)
  }

  if (body !== null) {
    if (bodyType === 'json') {
      parts.push("-H 'Content-Type: application/json'")
      parts.push(`-d '${esc(body)}'`)
    } else if (bodyType === 'xml') {
      parts.push("-H 'Content-Type: application/xml'")
      parts.push(`-d '${esc(body)}'`)
    } else if (bodyType === 'urlencoded') {
      const decoded = tryParse(body)
      if (decoded) {
        for (const [k, v] of Object.entries(decoded)) {
          parts.push(`--data-urlencode '${esc(`${k}=${v}`)}'`)
        }
      }
    } else if (bodyType === 'form-data') {
      const decoded = tryParse(body)
      if (decoded) {
        for (const [k, v] of Object.entries(decoded)) {
          parts.push(`-F '${esc(`${k}=${v}`)}'`)
        }
      }
    } else {
      parts.push(`-d '${esc(body)}'`)
    }
  }

  return parts.join(' \\\n  ')
}

function generatePython(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toLowerCase()
  const lines = ['import requests', '']

  if (Object.keys(headers).length > 0) {
    lines.push('headers = {')
    for (const [k, v] of Object.entries(headers)) {
      lines.push(`    '${esc(k)}': '${esc(v)}',`)
    }
    lines.push('}')
    lines.push('')
  }

  const args = [`'${esc(url)}'`]
  if (Object.keys(headers).length > 0) args.push('headers=headers')

  if (body !== null && ['post', 'put', 'patch'].includes(m)) {
    if (bodyType === 'json') {
      lines.push(`payload = ${body}`)
      args.push('json=payload')
    } else {
      lines.push(`data = '${esc(body)}'`)
      args.push('data=data')
    }
    lines.push('')
  }

  lines.push(`response = requests.${m}(${args.join(', ')})`)
  lines.push('print(response.status_code)')
  lines.push('print(response.json())')

  return lines.join('\n')
}

function generatePhp(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toUpperCase()
  const lines = ['use Illuminate\\Support\\Facades\\Http;', '']

  let chain = 'Http'

  if (Object.keys(headers).length > 0) {
    const headerLines = Object.entries(headers).map(([k, v]) => `    '${esc(k)}' => '${esc(v)}'`)
    chain += `::withHeaders([\n${headerLines.join(',\n')},\n])`
  }

  if (bodyType === 'json' && body) {
    chain += (chain.includes('::') ? '' : '::') + 'asJson()'
  } else if (bodyType === 'urlencoded') {
    chain += (chain.includes('::') ? '' : '::') + 'asForm()'
  }

  const methodCall = m.toLowerCase()
  let bodyArg = ''
  if (body !== null && ['POST', 'PUT', 'PATCH'].includes(m)) {
    if (bodyType === 'json') {
      bodyArg = `, json_decode('${esc(body)}', true)`
    } else {
      bodyArg = `, '${esc(body)}'`
    }
  }

  const sep = chain.includes('::') ? '\n    ->' : '::'
  chain += `${sep}${methodCall}('${esc(url)}'${bodyArg})`

  lines.push(`$response = ${chain};`)
  lines.push('')
  lines.push('$response->status();')
  lines.push('$response->json();')

  return lines.join('\n')
}

function generateJavascript(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toUpperCase()
  const options = [`  method: '${m}'`]

  if (Object.keys(headers).length > 0) {
    const headerLines = Object.entries(headers).map(([k, v]) => `    '${esc(k)}': '${esc(v)}'`)
    options.push(`  headers: {\n${headerLines.join(',\n')}\n  }`)
  }

  if (body !== null && ['POST', 'PUT', 'PATCH'].includes(m)) {
    if (bodyType === 'json') {
      options.push(`  body: JSON.stringify(${body})`)
    } else {
      options.push(`  body: '${esc(body)}'`)
    }
  }

  return [
    `const response = await fetch('${esc(url)}', {`,
    options.join(',\n'),
    '});',
    '',
    'const data = await response.json();',
    'console.log(response.status, data);',
  ].join('\n')
}

function generateNode(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toLowerCase()
  const lines = ["import axios from 'axios';", '']

  const config: string[] = []
  if (Object.keys(headers).length > 0) {
    const headerLines = Object.entries(headers).map(([k, v]) => `    '${esc(k)}': '${esc(v)}'`)
    config.push(`  headers: {\n${headerLines.join(',\n')}\n  }`)
  }

  const args = [`'${esc(url)}'`]
  if (body !== null && ['post', 'put', 'patch'].includes(m)) {
    args.push(bodyType === 'json' ? body : `'${esc(body)}'`)
  }
  if (config.length > 0) {
    args.push(`{\n${config.join(',\n')}\n}`)
  }

  lines.push(`const response = await axios.${m}(${args.join(', ')});`)
  lines.push('')
  lines.push('console.log(response.status, response.data);')

  return lines.join('\n')
}

function tryParse(json: string): Record<string, string> | null {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
