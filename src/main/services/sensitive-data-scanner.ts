/**
 * Sensitive data scanner — detects and sanitizes plain-text secrets in request data.
 * Port of app/Services/SensitiveDataScanner.php
 */

import type { KeyValueEntry, AuthConfig } from '../../shared/types/models'

export interface SensitiveFinding {
  source: string
  requestName: string | null
  requestId: string | null
  field: string
  key: string
  maskedValue: string
}

interface RequestData {
  id: string
  name: string
  url: string
  headers: KeyValueEntry[]
  query_params: KeyValueEntry[]
  body: string | null
  body_type: string
  auth: AuthConfig | null
  scripts?: unknown
}

interface CollectionData {
  variables?: KeyValueEntry[]
  auth?: AuthConfig | null
  [key: string]: unknown
}

interface FolderData {
  id: string
  name: string
  auth: AuthConfig | null
}

const SENSITIVE_HEADER_KEYS = [
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-secret-key',
  'x-csrf-token',
  'x-xsrf-token',
  'x-token',
  'cookie',
  'set-cookie',
]

const SENSITIVE_PARAM_KEYS = [
  // Auth tokens
  'token', 'access_token', 'accesstoken', 'auth_token', 'authtoken',
  'refresh_token', 'refreshtoken', 'bearer_token', 'id_token',
  'session_token', 'sessiontoken', 'jwt', 'jwt_token', 'oauth_token',
  'csrf_token', 'xsrf_token',
  // API keys
  'api_key', 'apikey', 'api-key', 'api_secret', 'apisecret',
  'app_key', 'appkey', 'app_secret', 'appsecret',
  'consumer_key', 'consumer_secret', 'master_key', 'masterkey',
  // Passwords & secrets
  'password', 'passwd', 'pass', 'secret', 'secret_key', 'secretkey',
  'private_key', 'privatekey', 'signing_key', 'encryption_key',
  'hmac_key', 'hmac_secret', 'webhook_secret', 'client_secret', 'client_id',
  // Keys (generic)
  'key', 'credentials', 'credential',
  // Session / identity
  'session_id', 'sessionid', 'sid', 'pin', 'otp', 'totp', 'totp_secret', 'recovery_code',
  // Database
  'db_password', 'database_password', 'connection_string',
  // Cloud / service-specific
  'aws_secret_access_key', 'aws_access_key_id', 'stripe_key', 'stripe_secret',
  'twilio_auth_token', 'sendgrid_api_key', 'slack_token', 'github_token',
  'gitlab_token', 'heroku_api_key', 'firebase_api_key',
  // Financial / PII
  'ssn', 'credit_card', 'card_number', 'cvv', 'cvc', 'account_number', 'routing_number',
]

const ALL_SENSITIVE_KEYS = [...SENSITIVE_HEADER_KEYS, ...SENSITIVE_PARAM_KEYS]

function isSensitiveKey(key: string, sensitiveKeys: string[]): boolean {
  return sensitiveKeys.includes(key.toLowerCase())
}

function isVariableReference(value: string): boolean {
  return /\{\{.+?\}\}/.test(value)
}

function maskValue(value: string): string {
  if (value.length <= 4) return value
  return value.slice(0, 4) + '*'.repeat(Math.min(value.length - 4, 8))
}

// --- Scanning ---

export function scanRequest(request: RequestData): SensitiveFinding[] {
  return [
    ...scanAuth(request),
    ...scanHeaders(request),
    ...scanQueryParams(request),
    ...scanBody(request),
  ]
}

export function scanCollection(
  requests: RequestData[],
  variables: KeyValueEntry[],
  collectionAuth?: AuthConfig | null,
  folders?: FolderData[],
): SensitiveFinding[] {
  const findings: SensitiveFinding[] = []

  // Scan collection-level auth
  if (collectionAuth) {
    findings.push(...scanContainerAuth(collectionAuth, 'collection', null, null))
  }

  // Scan folder-level auth
  if (folders) {
    for (const folder of folders) {
      if (folder.auth) {
        findings.push(...scanContainerAuth(folder.auth, 'folder', folder.name, folder.id))
      }
    }
  }

  for (const req of requests) {
    findings.push(...scanRequest(req))
  }

  const referencedVars = collectReferencedVariables(requests)
  findings.push(...scanCollectionVariables(variables, referencedVars))

  return findings
}

function scanAuth(request: RequestData): SensitiveFinding[] {
  const auth = request.auth
  if (!auth || !auth.type || auth.type === 'none') return []

  const findings: SensitiveFinding[] = []
  const check = (value: string | undefined, label: string): void => {
    if (value && value !== '' && !isVariableReference(value)) {
      findings.push({
        source: 'auth',
        requestName: request.name,
        requestId: request.id,
        field: 'auth',
        key: label,
        maskedValue: maskValue(value),
      })
    }
  }

  if (auth.type === 'bearer') check(auth.bearer_token, 'bearer token')
  else if (auth.type === 'basic') check(auth.basic_password, 'basic password')
  else if (auth.type === 'api-key') check(auth.api_key_value, 'api-key value')

  return findings
}

function scanContainerAuth(
  auth: AuthConfig,
  source: string,
  name: string | null,
  id: string | null,
): SensitiveFinding[] {
  if (!auth.type || auth.type === 'none' || auth.type === 'inherit') return []

  const findings: SensitiveFinding[] = []
  const check = (value: string | undefined, label: string): void => {
    if (value && value !== '' && !isVariableReference(value)) {
      findings.push({
        source,
        requestName: name,
        requestId: id,
        field: 'auth',
        key: label,
        maskedValue: maskValue(value),
      })
    }
  }

  if (auth.type === 'bearer') check(auth.bearer_token, 'bearer token')
  else if (auth.type === 'basic') check(auth.basic_password, 'basic password')
  else if (auth.type === 'api-key') check(auth.api_key_value, 'api-key value')

  return findings
}

function scanHeaders(request: RequestData): SensitiveFinding[] {
  return scanKeyValueData(request.headers ?? [], ALL_SENSITIVE_KEYS, 'header', 'headers', request)
}

function scanQueryParams(request: RequestData): SensitiveFinding[] {
  return scanKeyValueData(request.query_params ?? [], SENSITIVE_PARAM_KEYS, 'param', 'query_params', request)
}

function isKeyValueArray(data: unknown[]): boolean {
  return data.length > 0 && data.every(
    (item) => typeof item === 'object' && item !== null && 'key' in item && 'value' in item,
  )
}

function scanBody(request: RequestData): SensitiveFinding[] {
  const body = request.body
  if (!body) return []

  try {
    const decoded = JSON.parse(body)

    // Key-value array (form-data, urlencoded, or json body with key/value entries)
    if (Array.isArray(decoded) && isKeyValueArray(decoded)) {
      return scanKeyValueData(decoded as KeyValueEntry[], SENSITIVE_PARAM_KEYS, 'body', 'body', request)
    }

    // Arbitrary JSON object: recursive scan
    if (typeof decoded === 'object' && decoded !== null) {
      return scanJsonRecursive(decoded, request)
    }
  } catch { /* ignore parse errors */ }

  return []
}

function scanKeyValueData(
  data: KeyValueEntry[],
  sensitiveKeys: string[],
  source: string,
  field: string,
  request: RequestData,
): SensitiveFinding[] {
  if (!Array.isArray(data)) return []
  const findings: SensitiveFinding[] = []

  for (const pair of data) {
    const key = pair.key ?? ''
    const value = pair.value ?? ''
    if (!key || !value) continue
    if (isVariableReference(value)) continue
    if (isSensitiveKey(key, sensitiveKeys)) {
      findings.push({
        source,
        requestName: request.name,
        requestId: request.id,
        field,
        key,
        maskedValue: maskValue(value),
      })
    }
  }

  return findings
}

function scanJsonRecursive(data: Record<string, unknown>, request: RequestData): SensitiveFinding[] {
  const findings: SensitiveFinding[] = []

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      findings.push(...scanJsonRecursive(value as Record<string, unknown>, request))
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          findings.push(...scanJsonRecursive(item as Record<string, unknown>, request))
        }
      }
      continue
    }
    if (typeof value !== 'string' || value === '') continue
    if (isVariableReference(value)) continue
    if (isSensitiveKey(key, SENSITIVE_PARAM_KEYS)) {
      findings.push({
        source: 'body',
        requestName: request.name,
        requestId: request.id,
        field: 'body',
        key,
        maskedValue: maskValue(value),
      })
    }
  }

  return findings
}

function scanCollectionVariables(
  variables: KeyValueEntry[],
  referencedVars: string[],
): SensitiveFinding[] {
  if (!Array.isArray(variables)) return []
  const findings: SensitiveFinding[] = []

  for (const variable of variables) {
    const key = variable.key ?? ''
    const value = variable.value ?? ''
    if (!key || !value) continue
    if (isVariableReference(value)) continue
    // Skip variables actively used as {{name}} references
    if (referencedVars.includes(key)) continue
    if (isSensitiveKey(key, ALL_SENSITIVE_KEYS)) {
      findings.push({
        source: 'variable',
        requestName: null,
        requestId: null,
        field: 'variables',
        key,
        maskedValue: maskValue(value),
      })
    }
  }

  return findings
}

function collectReferencedVariables(requests: RequestData[]): string[] {
  const vars = new Set<string>()

  for (const request of requests) {
    const haystack = JSON.stringify([
      request.url,
      request.headers,
      request.query_params,
      request.body,
      request.auth,
    ])
    const matches = haystack.matchAll(/\{\{(.+?)\}\}/g)
    for (const match of matches) {
      vars.add(match[1])
    }
  }

  return [...vars]
}

// --- Sanitization ---

export function sanitizeRequestData(data: Record<string, unknown>): Record<string, unknown> {
  // Sanitize auth
  if (data.auth && typeof data.auth === 'object') {
    data.auth = sanitizeAuthData(data.auth as Record<string, unknown>)
  }

  // Sanitize headers
  if (Array.isArray(data.headers)) {
    data.headers = sanitizeKeyValuePairs(data.headers as KeyValueEntry[], ALL_SENSITIVE_KEYS)
  }

  // Sanitize query params
  if (Array.isArray(data.query_params)) {
    data.query_params = sanitizeKeyValuePairs(data.query_params as KeyValueEntry[], SENSITIVE_PARAM_KEYS)
  }

  // Sanitize body
  if (data.body) {
    data.body = sanitizeBodyData(data.body as string, (data.body_type as string) ?? 'none')
  }

  return data
}

export function sanitizeCollectionData(data: CollectionData): CollectionData {
  if (data.variables && Array.isArray(data.variables)) {
    data.variables = sanitizeKeyValuePairs(data.variables, ALL_SENSITIVE_KEYS)
  }
  if (data.auth && typeof data.auth === 'object') {
    data.auth = sanitizeAuthData(data.auth as unknown as Record<string, unknown>) as unknown as AuthConfig
  }
  return data
}

export function sanitizeFolderData(data: Record<string, unknown>): Record<string, unknown> {
  if (data.auth && typeof data.auth === 'object') {
    data.auth = sanitizeAuthData(data.auth as Record<string, unknown>)
  }
  return data
}

function sanitizeAuthData(auth: Record<string, unknown>): Record<string, unknown> {
  const type = auth.type as string ?? 'none'

  const fieldsToSanitize: string[] =
    type === 'bearer' ? ['bearer_token'] :
    type === 'basic' ? ['basic_password'] :
    type === 'api-key' ? ['api_key_value'] :
    []

  for (const field of fieldsToSanitize) {
    const value = auth[field]
    if (typeof value === 'string' && value !== '' && !isVariableReference(value)) {
      auth[field] = ''
    }
  }

  return auth
}

function sanitizeKeyValuePairs(data: KeyValueEntry[], sensitiveKeys: string[]): KeyValueEntry[] {
  return data.map((item) => {
    const key = item.key ?? ''
    const value = item.value ?? ''
    if (value !== '' && !isVariableReference(value) && isSensitiveKey(key, sensitiveKeys)) {
      return { ...item, value: '' }
    }
    return item
  })
}

function sanitizeBodyData(body: string, _bodyType: string): string {
  try {
    const decoded = JSON.parse(body)

    // Key-value array (form-data, urlencoded, or json body with key/value entries)
    if (Array.isArray(decoded) && isKeyValueArray(decoded)) {
      return JSON.stringify(sanitizeKeyValuePairs(decoded as KeyValueEntry[], SENSITIVE_PARAM_KEYS))
    }

    // Arbitrary JSON object
    if (typeof decoded === 'object' && decoded !== null) {
      return JSON.stringify(sanitizeJsonRecursive(decoded))
    }
  } catch { /* ignore */ }

  return body
}

function sanitizeJsonRecursive(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeJsonRecursive(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeJsonRecursive(item as Record<string, unknown>)
          : item,
      )
    } else if (
      typeof value === 'string' &&
      value !== '' &&
      !isVariableReference(value) &&
      isSensitiveKey(key, SENSITIVE_PARAM_KEYS)
    ) {
      result[key] = ''
    } else {
      result[key] = value
    }
  }

  return result
}

// --- MCP Server scanning ---

interface McpServerData {
  id?: string
  name?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  [key: string]: unknown
}

export function scanMcpServer(server: McpServerData): SensitiveFinding[] {
  const findings: SensitiveFinding[] = []

  // Scan env values
  if (server.env && typeof server.env === 'object') {
    for (const [key, value] of Object.entries(server.env)) {
      if (!key || !value) continue
      if (isVariableReference(value)) continue
      if (isSensitiveKey(key, SENSITIVE_PARAM_KEYS)) {
        findings.push({
          source: 'env',
          requestName: server.name ?? null,
          requestId: server.id ?? null,
          field: 'env',
          key,
          maskedValue: maskValue(value),
        })
      }
    }
  }

  // Scan header values
  if (server.headers && typeof server.headers === 'object') {
    for (const [key, value] of Object.entries(server.headers)) {
      if (!key || !value) continue
      if (isVariableReference(value)) continue
      if (isSensitiveKey(key, ALL_SENSITIVE_KEYS)) {
        findings.push({
          source: 'header',
          requestName: server.name ?? null,
          requestId: server.id ?? null,
          field: 'headers',
          key,
          maskedValue: maskValue(value),
        })
      }
    }
  }

  return findings
}

export function sanitizeMcpServerData(data: Record<string, unknown>): Record<string, unknown> {
  // Sanitize env values
  if (data.env && typeof data.env === 'object') {
    const env = { ...(data.env as Record<string, string>) }
    for (const [key, value] of Object.entries(env)) {
      if (value && !isVariableReference(value) && isSensitiveKey(key, SENSITIVE_PARAM_KEYS)) {
        env[key] = ''
      }
    }
    data.env = env
  }

  // Sanitize header values
  if (data.headers && typeof data.headers === 'object') {
    const headers = { ...(data.headers as Record<string, string>) }
    for (const [key, value] of Object.entries(headers)) {
      if (value && !isVariableReference(value) && isSensitiveKey(key, ALL_SENSITIVE_KEYS)) {
        headers[key] = ''
      }
    }
    data.headers = headers
  }

  return data
}

export { isVariableReference, maskValue }
