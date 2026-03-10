/**
 * OpenAPI 3.0.3 export — converts a Vaxtly collection into an OpenAPI spec.
 * Folder hierarchy maps to tags, requests map to path operations.
 */

import yaml from 'js-yaml'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as requestsRepo from '../database/repositories/requests'
import type { Folder, Request as Req, KeyValueEntry, AuthConfig } from '../../shared/types/models'

// --- OpenAPI types (subset we emit) ---

interface OpenAPIDocument {
  openapi: string
  info: { title: string; description: string; version: string }
  servers: { url: string }[]
  tags: { name: string }[]
  paths: Record<string, Record<string, OpenAPIOperation>>
  components: { securitySchemes?: Record<string, OpenAPISecurityScheme> }
}

interface OpenAPIOperation {
  tags?: string[]
  summary: string
  operationId: string
  parameters?: OpenAPIParameter[]
  requestBody?: {
    content: Record<string, { schema?: Record<string, unknown>; example?: unknown }>
    required?: boolean
  }
  responses: Record<string, { description: string }>
  security?: Record<string, string[]>[]
}

interface OpenAPIParameter {
  name: string
  in: 'query' | 'header' | 'path'
  description: string
  required?: boolean
  schema: { type: string }
}

interface OpenAPISecurityScheme {
  type: string
  scheme?: string
  bearerFormat?: string
  name?: string
  in?: string
  flows?: Record<string, unknown>
}

// --- Main export ---

export function exportOpenAPI(collectionId: string): OpenAPIDocument {
  const collection = collectionsRepo.findById(collectionId)
  if (!collection) throw new Error(`Collection not found: ${collectionId}`)

  const allFolders = foldersRepo.findByCollection(collection.id)
  const allRequests = requestsRepo.findByCollection(collection.id)

  const folderMap = new Map<string, Folder>()
  for (const f of allFolders) folderMap.set(f.id, f)

  const serverUrl = extractBaseUrl(allRequests)
  const tags = buildTags(allFolders)
  const paths: Record<string, Record<string, OpenAPIOperation>> = {}
  const securitySchemes: Record<string, OpenAPISecurityScheme> = {}
  const usedOperationIds = new Set<string>()

  for (const request of allRequests) {
    // Skip WebSocket requests
    if (request.method === 'WS' || request.method === 'WSS') continue

    const rawPath = extractPath(request.url, serverUrl)
    const openApiPath = convertVariables(rawPath)
    const method = request.method.toLowerCase()

    const tag = request.folder_id ? getFolderTag(request.folder_id, folderMap) : undefined
    const operationId = generateOperationId(request.name, usedOperationIds)
    usedOperationIds.add(operationId)

    const operation: OpenAPIOperation = {
      summary: request.name,
      operationId,
      responses: { '200': { description: 'Successful response' } },
    }

    if (tag) operation.tags = [tag]

    const params = buildParameters(request, openApiPath)
    if (params.length > 0) operation.parameters = params

    const body = buildRequestBody(request)
    if (body) operation.requestBody = body

    const auth = request.auth ? safeJsonParse<AuthConfig>(request.auth) : null
    if (auth && auth.type !== 'none') {
      const sec = buildSecurity(auth)
      if (sec) {
        securitySchemes[sec.name] = sec.scheme
        operation.security = [{ [sec.name]: sec.scopes }]
      }
    }

    if (!paths[openApiPath]) paths[openApiPath] = {}
    paths[openApiPath][method] = operation
  }

  const doc: OpenAPIDocument = {
    openapi: '3.0.3',
    info: {
      title: collection.name,
      description: collection.description ?? '',
      version: '1.0.0',
    },
    servers: serverUrl ? [{ url: serverUrl }] : [],
    tags,
    paths,
    components: {},
  }

  if (Object.keys(securitySchemes).length > 0) {
    doc.components.securitySchemes = securitySchemes
  }

  return yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' })
}

// --- Helpers ---

/**
 * Find a common base URL across all requests.
 * Handles both literal URLs and {{variable}} prefixes.
 */
function extractBaseUrl(requests: Req[]): string {
  const urls = requests
    .filter((r) => r.url && r.method !== 'WS' && r.method !== 'WSS')
    .map((r) => r.url)

  if (urls.length === 0) return ''

  // Check for common {{variable}} prefix (e.g. {{baseUrl}})
  const varMatch = urls[0].match(/^(\{\{[^}]+\}\})/)
  if (varMatch) {
    const prefix = varMatch[1]
    if (urls.every((u) => u.startsWith(prefix))) return prefix
  }

  // Try common origin (scheme + host)
  try {
    const origins = urls
      .filter((u) => /^https?:\/\//.test(u))
      .map((u) => {
        // Strip {{var}} segments from path for URL parsing
        const clean = u.replace(/\{\{[^}]+\}\}/g, 'placeholder')
        const parsed = new URL(clean)
        return parsed.origin
      })

    if (origins.length > 0 && origins.every((o) => o === origins[0])) {
      return origins[0]
    }
  } catch {
    // Unparseable URLs
  }

  return ''
}

/** Strip the base URL prefix to get the path portion. */
function extractPath(url: string, baseUrl: string): string {
  if (!url) return '/'

  let path = url
  if (baseUrl && path.startsWith(baseUrl)) {
    path = path.slice(baseUrl.length)
  }

  // Strip query string (we handle params separately)
  const qIdx = path.indexOf('?')
  if (qIdx !== -1) path = path.slice(0, qIdx)

  // Ensure leading slash
  if (!path.startsWith('/')) path = '/' + path

  return path || '/'
}

/** Convert {{variable}} to {variable} for OpenAPI path parameters. */
function convertVariables(path: string): string {
  return path.replace(/\{\{([^}]+)\}\}/g, '{$1}')
}

/** Build tags from top-level folders (no nesting in tags). */
function buildTags(folders: Folder[]): { name: string }[] {
  const topLevel = folders.filter((f) => !f.parent_id)
  return topLevel.map((f) => ({ name: f.name }))
}

/** Get the top-level folder name as a tag for a request. */
function getFolderTag(folderId: string, folderMap: Map<string, Folder>): string | undefined {
  let current = folderMap.get(folderId)
  while (current?.parent_id) {
    current = folderMap.get(current.parent_id)
  }
  return current?.name
}

/** Generate a unique camelCase operationId from the request name. */
function generateOperationId(name: string, used: Set<string>): string {
  let id = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/\s+/g, '')

  // Ensure starts with lowercase
  if (id.length > 0) id = id[0].toLowerCase() + id.slice(1)
  if (!id) id = 'operation'

  // Deduplicate
  let result = id
  let counter = 2
  while (used.has(result)) {
    result = `${id}${counter}`
    counter++
  }

  return result
}

/** Build query, header, and path parameters for an operation. */
function buildParameters(request: Req, openApiPath: string): OpenAPIParameter[] {
  const params: OpenAPIParameter[] = []

  // Path parameters (from {variable} in path)
  const pathVars = openApiPath.match(/\{([^}]+)\}/g)
  if (pathVars) {
    for (const v of pathVars) {
      const name = v.slice(1, -1) // strip { }
      params.push({
        name,
        in: 'path',
        description: '',
        required: true,
        schema: { type: 'string' },
      })
    }
  }

  // Query parameters
  const queryParams = request.query_params ? safeJsonParse<KeyValueEntry[]>(request.query_params) : null
  if (queryParams) {
    for (const p of queryParams) {
      if (!p.enabled) continue
      params.push({
        name: p.key,
        in: 'query',
        description: p.description ?? '',
        schema: { type: 'string' },
      })
    }
  }

  // Headers (skip Content-Type, Authorization — handled elsewhere)
  const headers = request.headers ? safeJsonParse<KeyValueEntry[]>(request.headers) : null
  if (headers) {
    const skip = new Set(['content-type', 'authorization', 'accept'])
    for (const h of headers) {
      if (!h.enabled) continue
      if (skip.has(h.key.toLowerCase())) continue
      params.push({
        name: h.key,
        in: 'header',
        description: h.description ?? '',
        schema: { type: 'string' },
      })
    }
  }

  return params
}

/** Build requestBody from the request's body and body_type. */
function buildRequestBody(request: Req): OpenAPIOperation['requestBody'] | null {
  if (request.body_type === 'none' || !request.body) return null

  const contentTypeMap: Record<string, string> = {
    json: 'application/json',
    xml: 'application/xml',
    'form-data': 'multipart/form-data',
    urlencoded: 'application/x-www-form-urlencoded',
    raw: 'text/plain',
    graphql: 'application/json',
  }

  const contentType = contentTypeMap[request.body_type] ?? 'application/octet-stream'
  const content: Record<string, { schema?: Record<string, unknown>; example?: unknown }> = {}

  if (request.body_type === 'json' || request.body_type === 'graphql') {
    const parsed = safeJsonParse<unknown>(request.body)
    if (parsed !== null) {
      content[contentType] = {
        schema: { type: 'object' },
        example: parsed,
      }
    } else {
      content[contentType] = { schema: { type: 'object' } }
    }
  } else if (request.body_type === 'form-data' || request.body_type === 'urlencoded') {
    const entries = safeJsonParse<KeyValueEntry[]>(request.body)
    if (entries && Array.isArray(entries)) {
      const properties: Record<string, { type: string; example?: string }> = {}
      for (const e of entries) {
        if (!e.enabled) continue
        properties[e.key] = { type: 'string', example: e.value }
      }
      content[contentType] = {
        schema: {
          type: 'object',
          properties,
        },
      }
    } else {
      content[contentType] = { schema: { type: 'object' } }
    }
  } else if (request.body_type === 'xml') {
    content[contentType] = {
      schema: { type: 'string' },
      example: request.body,
    }
  } else {
    content[contentType] = { schema: { type: 'string' } }
  }

  return { content, required: true }
}

/** Map AuthConfig to OpenAPI securityScheme. */
function buildSecurity(
  auth: AuthConfig,
): { name: string; scheme: OpenAPISecurityScheme; scopes: string[] } | null {
  switch (auth.type) {
    case 'bearer':
      return {
        name: 'bearerAuth',
        scheme: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        scopes: [],
      }
    case 'basic':
      return {
        name: 'basicAuth',
        scheme: { type: 'http', scheme: 'basic' },
        scopes: [],
      }
    case 'api-key':
      return {
        name: 'apiKeyAuth',
        scheme: {
          type: 'apiKey',
          name: auth.api_key_header ?? 'X-API-Key',
          in: 'header',
        },
        scopes: [],
      }
    case 'oauth2': {
      const flows: Record<string, unknown> = {}
      const scopes: Record<string, string> = {}
      if (auth.oauth2_scope) {
        for (const s of auth.oauth2_scope.split(/\s+/)) {
          if (s) scopes[s] = ''
        }
      }

      switch (auth.oauth2_grant_type) {
        case 'authorization_code':
          flows.authorizationCode = {
            authorizationUrl: auth.oauth2_authorization_url ?? '',
            tokenUrl: auth.oauth2_access_token_url ?? '',
            scopes,
          }
          break
        case 'client_credentials':
          flows.clientCredentials = {
            tokenUrl: auth.oauth2_access_token_url ?? '',
            scopes,
          }
          break
        case 'password':
          flows.password = {
            tokenUrl: auth.oauth2_access_token_url ?? '',
            scopes,
          }
          break
        default:
          flows.implicit = {
            authorizationUrl: auth.oauth2_authorization_url ?? '',
            scopes,
          }
      }

      return {
        name: 'oauth2Auth',
        scheme: { type: 'oauth2', flows },
        scopes: Object.keys(scopes),
      }
    }
    default:
      return null
  }
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
