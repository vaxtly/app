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

export type CodeLanguage = 'curl' | 'python' | 'php' | 'javascript' | 'node' | 'go' | 'ruby' | 'csharp' | 'java'

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
    case 'go': return generateGo(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    case 'ruby': return generateRuby(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    case 'csharp': return generateCsharp(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
    case 'java': return generateJava(data.method, resolvedUrl, resolvedHeaders, resolvedBody, data.bodyType)
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
  } else if (data.authType === 'oauth2' && data.authToken) {
    headers['Authorization'] = `Bearer ${sub(data.authToken)}`
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
    case 'graphql': {
      if (!body) return null
      try {
        const parsed = JSON.parse(body)
        if (parsed && typeof parsed.query === 'string') {
          return JSON.stringify({ query: sub(parsed.query), variables: parsed.variables ?? {} })
        }
      } catch { /* bare query */ }
      return JSON.stringify({ query: sub(body), variables: {} })
    }
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
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')
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
    options.push(`  body: '${esc(body)}'`)
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
    args.push(`'${esc(body)}'`)
  }
  if (config.length > 0) {
    args.push(`{\n${config.join(',\n')}\n}`)
  }

  lines.push(`const response = await axios.${m}(${args.join(', ')});`)
  lines.push('')
  lines.push('console.log(response.status, response.data);')

  return lines.join('\n')
}

function generateGo(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toUpperCase()
  const lines: string[] = ['package main', '', 'import (', '    "fmt"', '    "net/http"']
  const hasBody = body !== null && ['POST', 'PUT', 'PATCH'].includes(m)

  if (hasBody) {
    lines.push('    "strings"')
  }

  lines.push(')', '')
  lines.push('func main() {')

  if (hasBody) {
    lines.push(`    body := strings.NewReader(\`${body}\`)`)
    lines.push(`    req, _ := http.NewRequest("${m}", "${esc(url)}", body)`)
  } else {
    lines.push(`    req, _ := http.NewRequest("${m}", "${esc(url)}", nil)`)
  }

  if (hasBody && bodyType === 'json') {
    setGoHeader(headers, 'Content-Type', 'application/json')
  } else if (hasBody && bodyType === 'xml') {
    setGoHeader(headers, 'Content-Type', 'application/xml')
  }

  for (const [k, v] of Object.entries(headers)) {
    lines.push(`    req.Header.Set("${esc(k)}", "${esc(v)}")`)
  }

  lines.push('')
  lines.push('    resp, _ := http.DefaultClient.Do(req)')
  lines.push('    fmt.Println(resp.StatusCode)')
  lines.push('}')

  return lines.join('\n')
}

function setGoHeader(headers: Record<string, string>, name: string, value: string): void {
  const lower = name.toLowerCase()
  if (!Object.keys(headers).some((k) => k.toLowerCase() === lower)) {
    headers[name] = value
  }
}

function generateRuby(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toUpperCase()
  const hasBody = body !== null && ['POST', 'PUT', 'PATCH'].includes(m)
  const lines: string[] = ["require 'net/http'", "require 'json'", '']

  lines.push(`uri = URI('${esc(url)}')`)
  lines.push('http = Net::HTTP.new(uri.host, uri.port)')
  lines.push("http.use_ssl = uri.scheme == 'https'")

  const rubyMethod = m.charAt(0) + m.slice(1).toLowerCase()
  lines.push(`request = Net::HTTP::${rubyMethod}.new(uri)`)

  if (hasBody && bodyType === 'json') {
    setRubyHeader(headers, 'Content-Type', 'application/json')
  } else if (hasBody && bodyType === 'xml') {
    setRubyHeader(headers, 'Content-Type', 'application/xml')
  }

  for (const [k, v] of Object.entries(headers)) {
    lines.push(`request['${esc(k)}'] = '${esc(v)}'`)
  }

  if (hasBody) {
    lines.push(`request.body = '${esc(body!)}'`)
  }

  lines.push('')
  lines.push('response = http.request(request)')
  lines.push('puts response.code, response.body')

  return lines.join('\n')
}

function setRubyHeader(headers: Record<string, string>, name: string, value: string): void {
  const lower = name.toLowerCase()
  if (!Object.keys(headers).some((k) => k.toLowerCase() === lower)) {
    headers[name] = value
  }
}

function generateCsharp(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toUpperCase()
  const hasBody = body !== null && ['POST', 'PUT', 'PATCH'].includes(m)
  const lines: string[] = ['using System.Net.Http;', '']

  lines.push('var client = new HttpClient();')

  // Add headers (skip Content-Type since it goes on content)
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'content-type') continue
    lines.push(`client.DefaultRequestHeaders.Add("${esc(k)}", "${esc(v)}");`)
  }

  if (hasBody) {
    let mediaType = 'text/plain'
    if (bodyType === 'json') mediaType = 'application/json'
    else if (bodyType === 'xml') mediaType = 'application/xml'
    else {
      const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')
      if (ct) mediaType = ct[1]
    }
    lines.push(`var content = new StringContent("${escCsharp(body!)}", System.Text.Encoding.UTF8, "${mediaType}");`)

    const methodName = m.charAt(0) + m.slice(1).toLowerCase() + 'Async'
    lines.push(`var response = await client.${methodName}("${esc(url)}", content);`)
  } else {
    const methodName = m.charAt(0) + m.slice(1).toLowerCase() + 'Async'
    if (m === 'GET') {
      lines.push(`var response = await client.GetAsync("${esc(url)}");`)
    } else if (m === 'DELETE') {
      lines.push(`var response = await client.DeleteAsync("${esc(url)}");`)
    } else {
      lines.push(`var response = await client.${methodName}("${esc(url)}", null);`)
    }
  }

  lines.push('Console.WriteLine(await response.Content.ReadAsStringAsync());')

  return lines.join('\n')
}

function escCsharp(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
}

function generateJava(method: string, url: string, headers: Record<string, string>, body: string | null, bodyType: string): string {
  const m = method.toUpperCase()
  const hasBody = body !== null && ['POST', 'PUT', 'PATCH'].includes(m)
  const lines: string[] = [
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    'import java.net.URI;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    'HttpRequest request = HttpRequest.newBuilder()',
    `    .uri(URI.create("${esc(url)}"))`,
  ]

  if (hasBody && bodyType === 'json') {
    setJavaHeader(headers, 'Content-Type', 'application/json')
  } else if (hasBody && bodyType === 'xml') {
    setJavaHeader(headers, 'Content-Type', 'application/xml')
  }

  for (const [k, v] of Object.entries(headers)) {
    lines.push(`    .header("${esc(k)}", "${esc(v)}")`)
  }

  if (hasBody) {
    lines.push(`    .${m}(HttpRequest.BodyPublishers.ofString("${escCsharp(body!)}"))`)
  } else if (m === 'GET') {
    lines.push('    .GET()')
  } else if (m === 'DELETE') {
    lines.push('    .DELETE()')
  } else {
    lines.push(`    .method("${m}", HttpRequest.BodyPublishers.noBody())`)
  }

  lines.push('    .build();')
  lines.push('HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());')
  lines.push('System.out.println(response.statusCode());')

  return lines.join('\n')
}

function setJavaHeader(headers: Record<string, string>, name: string, value: string): void {
  const lower = name.toLowerCase()
  if (!Object.keys(headers).some((k) => k.toLowerCase() === lower)) {
    headers[name] = value
  }
}

function tryParse(json: string): Record<string, string> | null {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
