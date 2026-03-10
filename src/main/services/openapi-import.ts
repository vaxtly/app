/**
 * OpenAPI 3.0/3.1 import — converts an OpenAPI spec into a Vaxtly collection.
 * Accepts JSON string or YAML string (auto-detected).
 */

import yaml from 'js-yaml'
import { getDatabase } from '../database/connection'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as requestsRepo from '../database/repositories/requests'

export interface OpenAPIImportResult {
  collections: number
  requests: number
  folders: number
  errors: string[]
}

/**
 * Detect whether the input looks like an OpenAPI spec (parsed object).
 */
export function isOpenAPIFormat(parsed: Record<string, unknown>): boolean {
  return (
    (typeof parsed.openapi === 'string' || typeof parsed.swagger === 'string') &&
    typeof parsed.info === 'object' &&
    parsed.info !== null
  )
}

/**
 * Import an OpenAPI spec from a JSON or YAML string.
 */
export function importOpenAPI(input: string, workspaceId?: string): OpenAPIImportResult {
  const result: OpenAPIImportResult = { collections: 0, requests: 0, folders: 0, errors: [] }

  let spec: Record<string, unknown>
  try {
    spec = yaml.load(input) as Record<string, unknown>
  } catch {
    // Fallback to JSON parse
    try {
      spec = JSON.parse(input) as Record<string, unknown>
    } catch {
      result.errors.push('Invalid OpenAPI file — could not parse as YAML or JSON')
      return result
    }
  }

  if (!isOpenAPIFormat(spec)) {
    result.errors.push('Not a valid OpenAPI specification (missing openapi/swagger and info fields)')
    return result
  }

  const info = spec.info as Record<string, unknown>
  const title = (info.title as string) ?? 'Imported API'
  const description = (info.description as string) ?? undefined

  const servers = Array.isArray(spec.servers) ? (spec.servers as Record<string, unknown>[]) : []
  const baseUrl = servers.length > 0 ? (servers[0].url as string) ?? '' : ''

  const paths = (spec.paths as Record<string, Record<string, unknown>>) ?? {}
  const securitySchemes = extractSecuritySchemes(spec)

  const db = getDatabase()

  try {
    const txn = db.transaction(() => {
      const collection = collectionsRepo.create({
        name: generateUniqueCollectionName(title, workspaceId),
        workspace_id: workspaceId,
        description,
      })
      result.collections++

      // Build folders from tags
      const tagFolders = createTagFolders(spec, collection.id)
      result.folders += tagFolders.size

      // Create requests from paths
      for (const [path, methods] of Object.entries(paths)) {
        if (!methods || typeof methods !== 'object') continue

        for (const [method, operationObj] of Object.entries(methods)) {
          // Skip non-HTTP-method keys (like $ref, summary, description, parameters, servers)
          if (!isHttpMethod(method)) continue
          if (!operationObj || typeof operationObj !== 'object') continue

          const operation = operationObj as Record<string, unknown>

          try {
            createRequest(
              collection.id,
              baseUrl,
              path,
              method.toUpperCase(),
              operation,
              tagFolders,
              securitySchemes,
            )
            result.requests++
          } catch (e) {
            const opId = (operation.operationId as string) ?? `${method} ${path}`
            result.errors.push(`Failed to import ${opId}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
    })
    txn()
  } catch (e) {
    result.errors.push(`Failed to import: ${e instanceof Error ? e.message : String(e)}`)
  }

  return result
}

// --- Helpers ---

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])

function isHttpMethod(key: string): boolean {
  return HTTP_METHODS.has(key.toLowerCase())
}

function extractSecuritySchemes(spec: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const components = spec.components as Record<string, unknown> | undefined
  if (!components) return {}
  const schemes = components.securitySchemes as Record<string, Record<string, unknown>> | undefined
  return schemes ?? {}
}

/** Create a folder for each tag defined in the spec. */
function createTagFolders(
  spec: Record<string, unknown>,
  collectionId: string,
): Map<string, string> {
  const tagMap = new Map<string, string>() // tag name → folder id
  const tags = spec.tags as { name: string; description?: string }[] | undefined

  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (!tag.name) continue
      const folder = foldersRepo.create({
        collection_id: collectionId,
        name: tag.name,
      })
      tagMap.set(tag.name, folder.id)
    }
  }

  return tagMap
}

function createRequest(
  collectionId: string,
  baseUrl: string,
  path: string,
  method: string,
  operation: Record<string, unknown>,
  tagFolders: Map<string, string>,
  securitySchemes: Record<string, Record<string, unknown>>,
): void {
  // Determine folder from first tag
  const tags = operation.tags as string[] | undefined
  let folderId: string | undefined
  if (Array.isArray(tags) && tags.length > 0) {
    // Use existing tag folder, or create one on the fly
    folderId = tagFolders.get(tags[0])
    if (!folderId) {
      const folder = foldersRepo.create({
        collection_id: collectionId,
        name: tags[0],
      })
      tagFolders.set(tags[0], folder.id)
      folderId = folder.id
    }
  }

  // Build URL: baseUrl + path, convert {var} to {{var}}
  const url = (baseUrl + path).replace(/\{([^}]+)\}/g, '{{$1}}')

  const name = (operation.summary as string)
    ?? (operation.operationId as string)
    ?? `${method} ${path}`

  // Extract body
  const { body, bodyType } = extractRequestBody(operation)

  const request = requestsRepo.create({
    collection_id: collectionId,
    folder_id: folderId,
    name,
    method,
    url,
    body_type: bodyType,
  })

  // Build updates
  const updates: Record<string, string | null> = {}

  // Parameters
  const params = operation.parameters as Record<string, unknown>[] | undefined
  if (Array.isArray(params)) {
    const queryParams = params
      .filter((p) => p.in === 'query')
      .map((p) => ({
        key: (p.name as string) ?? '',
        value: '',
        enabled: !(p.deprecated ?? false),
        description: (p.description as string) ?? '',
      }))

    const headers = params
      .filter((p) => p.in === 'header')
      .map((p) => ({
        key: (p.name as string) ?? '',
        value: '',
        enabled: !(p.deprecated ?? false),
        description: (p.description as string) ?? '',
      }))

    if (queryParams.length > 0) updates.query_params = JSON.stringify(queryParams)
    if (headers.length > 0) updates.headers = JSON.stringify(headers)
  }

  if (body) updates.body = body

  // Auth from security
  const auth = extractAuth(operation, securitySchemes)
  if (auth) updates.auth = JSON.stringify(auth)

  if (Object.keys(updates).length > 0) {
    requestsRepo.update(request.id, updates)
  }
}

function extractRequestBody(
  operation: Record<string, unknown>,
): { body: string | null; bodyType: string } {
  const reqBody = operation.requestBody as Record<string, unknown> | undefined
  if (!reqBody) return { body: null, bodyType: 'none' }

  const content = reqBody.content as Record<string, Record<string, unknown>> | undefined
  if (!content) return { body: null, bodyType: 'none' }

  // Check content types in priority order
  if (content['application/json']) {
    const schema = content['application/json']
    const example = schema.example
    return {
      body: example != null ? JSON.stringify(example, null, 2) : null,
      bodyType: 'json',
    }
  }

  if (content['application/xml'] || content['text/xml']) {
    const schema = content['application/xml'] ?? content['text/xml']
    const example = schema?.example
    return {
      body: typeof example === 'string' ? example : null,
      bodyType: 'xml',
    }
  }

  if (content['multipart/form-data']) {
    const schema = content['multipart/form-data'].schema as Record<string, unknown> | undefined
    const properties = schema?.properties as Record<string, Record<string, unknown>> | undefined
    if (properties) {
      const entries = Object.entries(properties).map(([key, prop]) => ({
        key,
        value: prop.example != null ? String(prop.example) : '',
        enabled: true,
      }))
      return { body: JSON.stringify(entries), bodyType: 'form-data' }
    }
    return { body: null, bodyType: 'form-data' }
  }

  if (content['application/x-www-form-urlencoded']) {
    const schema = content['application/x-www-form-urlencoded'].schema as Record<string, unknown> | undefined
    const properties = schema?.properties as Record<string, Record<string, unknown>> | undefined
    if (properties) {
      const entries = Object.entries(properties).map(([key, prop]) => ({
        key,
        value: prop.example != null ? String(prop.example) : '',
        enabled: true,
      }))
      return { body: JSON.stringify(entries), bodyType: 'urlencoded' }
    }
    return { body: null, bodyType: 'urlencoded' }
  }

  // Fallback: first content type as raw
  const firstType = Object.keys(content)[0]
  if (firstType) {
    const schema = content[firstType]
    const example = schema?.example
    return {
      body: example != null ? (typeof example === 'string' ? example : JSON.stringify(example)) : null,
      bodyType: 'raw',
    }
  }

  return { body: null, bodyType: 'none' }
}

function extractAuth(
  operation: Record<string, unknown>,
  securitySchemes: Record<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const security = operation.security as Record<string, string[]>[] | undefined
  if (!Array.isArray(security) || security.length === 0) return null

  // Use the first security requirement
  const firstReq = security[0]
  const schemeName = Object.keys(firstReq)[0]
  if (!schemeName) return null

  const scheme = securitySchemes[schemeName]
  if (!scheme) return null

  const schemeType = scheme.type as string

  if (schemeType === 'http') {
    const httpScheme = (scheme.scheme as string)?.toLowerCase()
    if (httpScheme === 'bearer') {
      return { type: 'bearer', bearer_token: '' }
    }
    if (httpScheme === 'basic') {
      return { type: 'basic', basic_username: '', basic_password: '' }
    }
  }

  if (schemeType === 'apiKey') {
    return {
      type: 'api-key',
      api_key_header: (scheme.name as string) ?? 'X-API-Key',
      api_key_value: '',
    }
  }

  if (schemeType === 'oauth2') {
    const flows = scheme.flows as Record<string, Record<string, unknown>> | undefined
    if (!flows) return { type: 'oauth2' }

    const config: Record<string, unknown> = { type: 'oauth2' }
    const scopes = firstReq[schemeName] ?? []

    if (flows.authorizationCode) {
      config.oauth2_grant_type = 'authorization_code'
      config.oauth2_authorization_url = (flows.authorizationCode.authorizationUrl as string) ?? ''
      config.oauth2_access_token_url = (flows.authorizationCode.tokenUrl as string) ?? ''
    } else if (flows.clientCredentials) {
      config.oauth2_grant_type = 'client_credentials'
      config.oauth2_access_token_url = (flows.clientCredentials.tokenUrl as string) ?? ''
    } else if (flows.password) {
      config.oauth2_grant_type = 'password'
      config.oauth2_access_token_url = (flows.password.tokenUrl as string) ?? ''
    }

    if (scopes.length > 0) {
      config.oauth2_scope = scopes.join(' ')
    }

    return config
  }

  return null
}

function generateUniqueCollectionName(baseName: string, workspaceId?: string): string {
  const db = getDatabase()
  let name = baseName
  let counter = 1
  while (db.prepare('SELECT 1 FROM collections WHERE name = ? AND workspace_id IS ?').get(name, workspaceId ?? null)) {
    counter++
    name = `${baseName} (${counter})`
  }
  return name
}
