/**
 * Postman import service — imports collections and environments from Postman export formats.
 * Supports: workspace data dump, collection v2.1, environment.
 * JSON files only (ZIP support requires adding adm-zip dependency).
 */

import { getDatabase } from '../database/connection'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as requestsRepo from '../database/repositories/requests'
import * as environmentsRepo from '../database/repositories/environments'
import type { Folder } from '../../shared/types/models'

export interface PostmanImportResult {
  collections: number
  requests: number
  folders: number
  environments: number
  errors: string[]
}

/**
 * Import from a Postman JSON string.
 */
export function importPostman(json: string, workspaceId?: string): PostmanImportResult {
  const result: PostmanImportResult = {
    collections: 0,
    requests: 0,
    folders: 0,
    environments: 0,
    errors: [],
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    result.errors.push('Invalid JSON file')
    return result
  }

  processJson(data, result, workspaceId)
  return result
}

// --- Format detection and dispatch ---

function processJson(
  data: Record<string, unknown>,
  result: PostmanImportResult,
  workspaceId?: string,
): void {
  // Postman workspace dump format
  if (data.version && Array.isArray(data.collections)) {
    parseDumpFormat(data, result, workspaceId)
    return
  }

  // Postman collection v2.1
  const info = data.info as Record<string, unknown> | undefined
  if (info?._postman_id || info?.schema) {
    parseCollection(data, result, workspaceId)
    return
  }

  // Postman environment
  if (data._postman_variable_scope === 'environment') {
    parseEnvironment(data, result, workspaceId)
    return
  }

  // Alternative environment format
  if (Array.isArray(data.values) && typeof data.name === 'string') {
    parseEnvironment(data, result, workspaceId)
    return
  }

  result.errors.push('Unknown Postman format')
}

// --- Dump format ---

function parseDumpFormat(
  data: Record<string, unknown>,
  result: PostmanImportResult,
  workspaceId?: string,
): void {
  const collections = data.collections as Record<string, unknown>[] ?? []
  const environments = data.environments as Record<string, unknown>[] ?? []

  for (const collData of collections) {
    parseDumpCollection(collData, result, workspaceId)
  }

  for (const envData of environments) {
    parseEnvironment(envData, result, workspaceId)
  }
}

function parseDumpCollection(
  data: Record<string, unknown>,
  result: PostmanImportResult,
  workspaceId?: string,
): void {
  const name = (data.name as string) ?? 'Imported Collection'
  const description = (data.description as string) ?? null
  const variables = mapVariables((data.variables as Record<string, unknown>[]) ?? [])

  const db = getDatabase()

  try {
    const txn = db.transaction(() => {
      const collection = collectionsRepo.create({
        name: generateUniqueCollectionName(name),
        workspace_id: workspaceId,
        description: description ?? undefined,
      })

      if (variables.length > 0) {
        collectionsRepo.update(collection.id, { variables: JSON.stringify(variables) })
      }

      result.collections++

      // Build folder map from flat dump array
      const folderMap = createDumpFolders(
        (data.folders as Record<string, unknown>[]) ?? [],
        collection.id,
        result,
      )

      // Create requests
      createDumpRequests(
        (data.requests as Record<string, unknown>[]) ?? [],
        collection.id,
        folderMap,
        result,
      )
    })

    txn()
  } catch (e) {
    result.errors.push(`Failed to import collection '${name}': ${e instanceof Error ? e.message : String(e)}`)
  }
}

function createDumpFolders(
  folders: Record<string, unknown>[],
  collectionId: string,
  result: PostmanImportResult,
): Map<string, Folder> {
  const folderMap = new Map<string, Folder>()

  // Separate root and child folders
  const rootFolders = folders.filter((f) => !f.folder)
  const childFolders = folders.filter((f) => !!f.folder)

  for (const folderData of rootFolders) {
    const folder = foldersRepo.create({
      collection_id: collectionId,
      name: (folderData.name as string) ?? 'Unnamed Folder',
    })
    folderMap.set(folderData.id as string, folder)
    result.folders++
  }

  // Multi-pass for nested folders
  let remaining = [...childFolders]
  let maxPasses = 10

  while (remaining.length > 0 && maxPasses-- > 0) {
    const unresolved: Record<string, unknown>[] = []

    for (const folderData of remaining) {
      const parentId = folderData.folder as string
      const parentFolder = folderMap.get(parentId)

      if (parentFolder) {
        const folder = foldersRepo.create({
          collection_id: collectionId,
          name: (folderData.name as string) ?? 'Unnamed Folder',
          parent_id: parentFolder.id,
        })
        folderMap.set(folderData.id as string, folder)
        result.folders++
      } else {
        unresolved.push(folderData)
      }
    }

    remaining = unresolved
  }

  return folderMap
}

function createDumpRequests(
  requests: Record<string, unknown>[],
  collectionId: string,
  folderMap: Map<string, Folder>,
  result: PostmanImportResult,
): void {
  for (const reqData of requests) {
    const folderId = reqData.folder as string | null
    const folder = folderId ? folderMap.get(folderId) : null

    const method = ((reqData.method as string) ?? 'GET').toUpperCase()
    const url = stringify(reqData.url ?? '')
    const headers = extractDumpHeaders(reqData)
    const queryParams = extractDumpQueryParams(reqData)
    const body = extractDumpBody(reqData)
    const bodyType = mapDumpBodyType(reqData.dataMode as string | null)

    const request = requestsRepo.create({
      collection_id: collectionId,
      folder_id: folder?.id,
      name: (reqData.name as string) ?? 'Unnamed Request',
      method,
      url,
      body_type: bodyType,
    })

    requestsRepo.update(request.id, {
      headers: JSON.stringify(headers),
      query_params: JSON.stringify(queryParams),
      body,
    })

    result.requests++
  }
}

function extractDumpHeaders(reqData: Record<string, unknown>): { key: string; value: string; enabled: boolean }[] {
  // Prefer structured headerData
  const headerData = reqData.headerData as Record<string, unknown>[] | undefined
  if (headerData?.length) {
    const headers: { key: string; value: string; enabled: boolean }[] = []
    for (const h of headerData) {
      if (!h.key) continue
      headers.push({
        key: stringify(h.key),
        value: stringify(h.value ?? ''),
        enabled: !(h.disabled ?? false),
      })
    }
    if (headers.length > 0) return headers
  }

  // Fallback: parse "Key: Value" string format
  const headerStr = reqData.headers
  if (typeof headerStr === 'string' && headerStr) {
    return headerStr
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(':')
        if (idx === -1) return null
        return {
          key: line.substring(0, idx).trim(),
          value: line.substring(idx + 1).trim(),
          enabled: true,
        }
      })
      .filter(Boolean) as { key: string; value: string; enabled: boolean }[]
  }

  return []
}

function extractDumpQueryParams(reqData: Record<string, unknown>): { key: string; value: string; enabled: boolean }[] {
  const params = reqData.queryParams as Record<string, unknown>[] | undefined
  if (!params) return []

  return params
    .filter((p) => p.key)
    .map((p) => ({
      key: stringify(p.key),
      value: stringify(p.value ?? ''),
      enabled: !(p.disabled ?? false),
    }))
}

function extractDumpBody(reqData: Record<string, unknown>): string | null {
  const mode = reqData.dataMode as string | null

  if (mode === 'raw') {
    const raw = reqData.rawModeData
    return raw != null ? stringify(raw) : null
  }

  if (mode === 'params' && Array.isArray(reqData.data)) {
    const data = (reqData.data as Record<string, unknown>[])
      .filter((item) => (item.type ?? 'text') === 'text')
      .map((item) => ({
        key: stringify(item.key ?? ''),
        value: stringify(item.value ?? ''),
      }))
    return data.length > 0 ? JSON.stringify(data) : null
  }

  if (mode === 'urlencoded' && Array.isArray(reqData.data)) {
    const data = (reqData.data as Record<string, unknown>[]).map((item) => ({
      key: stringify(item.key ?? ''),
      value: stringify(item.value ?? ''),
    }))
    return JSON.stringify(data)
  }

  return null
}

function mapDumpBodyType(dataMode: string | null): string {
  switch (dataMode) {
    case 'raw': return 'json'
    case 'params': return 'form-data'
    case 'urlencoded': return 'urlencoded'
    default: return 'none'
  }
}

// --- Collection v2.1 format ---

function parseCollection(
  data: Record<string, unknown>,
  result: PostmanImportResult,
  workspaceId?: string,
): void {
  const info = (data.info as Record<string, unknown>) ?? {}
  const name = (info.name as string) ?? 'Imported Collection'
  const description = (info.description as string) ?? null
  const variables = mapVariables((data.variable as Record<string, unknown>[]) ?? [])

  const db = getDatabase()

  try {
    const txn = db.transaction(() => {
      const collection = collectionsRepo.create({
        name: generateUniqueCollectionName(name),
        workspace_id: workspaceId,
        description: description ?? undefined,
      })

      if (variables.length > 0) {
        collectionsRepo.update(collection.id, { variables: JSON.stringify(variables) })
      }

      result.collections++

      parseItems((data.item as Record<string, unknown>[]) ?? [], collection.id, null, result)
    })

    txn()
  } catch (e) {
    result.errors.push(`Failed to import collection '${name}': ${e instanceof Error ? e.message : String(e)}`)
  }
}

function parseItems(
  items: Record<string, unknown>[],
  collectionId: string,
  parentFolderId: string | null,
  result: PostmanImportResult,
): void {
  for (const item of items) {
    // Folder: has nested items array
    if (Array.isArray(item.item)) {
      const folder = foldersRepo.create({
        collection_id: collectionId,
        name: (item.name as string) ?? 'Unnamed Folder',
        parent_id: parentFolderId ?? undefined,
      })
      result.folders++

      parseItems(item.item as Record<string, unknown>[], collectionId, folder.id, result)
    } else if (item.request) {
      // Request
      createCollectionRequest(item, collectionId, parentFolderId, result)
    }
  }
}

function createCollectionRequest(
  item: Record<string, unknown>,
  collectionId: string,
  folderId: string | null,
  result: PostmanImportResult,
): void {
  let reqData = item.request as Record<string, unknown> | string

  // Handle simple URL string
  if (typeof reqData === 'string') {
    reqData = { method: 'GET', url: reqData }
  }

  const method = ((reqData.method as string) ?? 'GET').toUpperCase()
  const url = extractUrl(reqData.url ?? '')
  const queryParams = extractQueryParams(reqData.url ?? '')
  const headers = extractHeaders((reqData.header as Record<string, unknown>[]) ?? [])
  const bodyObj = reqData.body as Record<string, unknown> | null
  const body = extractBody(bodyObj)
  const bodyType = bodyObj ? mapBodyType(bodyObj) : 'none'

  const request = requestsRepo.create({
    collection_id: collectionId,
    folder_id: folderId ?? undefined,
    name: (item.name as string) ?? 'Unnamed Request',
    method,
    url,
    body_type: bodyType,
  })

  requestsRepo.update(request.id, {
    headers: JSON.stringify(headers),
    query_params: JSON.stringify(queryParams),
    body,
  })

  result.requests++
}

// --- Environment format ---

function parseEnvironment(
  data: Record<string, unknown>,
  result: PostmanImportResult,
  workspaceId?: string,
): void {
  const name = (data.name as string) ?? 'Imported Environment'
  const values = (data.values as Record<string, unknown>[]) ?? []

  const variables = values.map((v) => ({
    key: stringify(v.key ?? ''),
    value: stringify(v.value ?? ''),
    enabled: v.enabled !== false,
  }))

  try {
    environmentsRepo.create({
      name: generateUniqueEnvironmentName(name),
      workspace_id: workspaceId,
      variables: JSON.stringify(variables),
    })
    result.environments++
  } catch (e) {
    result.errors.push(`Failed to import environment '${name}': ${e instanceof Error ? e.message : String(e)}`)
  }
}

// --- Shared helpers ---

function extractUrl(url: unknown): string {
  if (typeof url === 'string') {
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
    } catch {
      return url
    }
  }

  if (typeof url === 'object' && url !== null) {
    const obj = url as Record<string, unknown>
    const raw = obj.raw as string | undefined

    if (raw) {
      try {
        const parsed = new URL(raw)
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
      } catch {
        return raw
      }
    }

    // Build from components
    const protocol = (obj.protocol as string) ?? 'https'
    const host = Array.isArray(obj.host) ? (obj.host as string[]).join('.') : ((obj.host as string) ?? '')
    const path = Array.isArray(obj.path) ? '/' + (obj.path as string[]).join('/') : ((obj.path as string) ?? '')
    const port = obj.port ? `:${obj.port}` : ''

    return `${protocol}://${host}${port}${path}`
  }

  return ''
}

function extractQueryParams(url: unknown): { key: string; value: string; enabled: boolean }[] {
  if (typeof url === 'string') {
    try {
      const parsed = new URL(url)
      const params: { key: string; value: string; enabled: boolean }[] = []
      parsed.searchParams.forEach((value, key) => {
        params.push({ key, value, enabled: true })
      })
      return params
    } catch {
      return []
    }
  }

  if (typeof url === 'object' && url !== null) {
    const query = (url as Record<string, unknown>).query as Record<string, unknown>[] | undefined
    if (!query) return []

    return query.map((p) => ({
      key: stringify(p.key ?? ''),
      value: stringify(p.value ?? ''),
      enabled: !(p.disabled ?? false),
    }))
  }

  return []
}

function extractHeaders(headers: Record<string, unknown>[]): { key: string; value: string; enabled: boolean }[] {
  return headers.map((h) => ({
    key: stringify(h.key ?? ''),
    value: stringify(h.value ?? ''),
    enabled: !(h.disabled ?? false),
  }))
}

function extractBody(body: Record<string, unknown> | null | undefined): string | null {
  if (!body) return null

  const mode = (body.mode as string) ?? 'none'
  const raw = body.raw

  switch (mode) {
    case 'raw':
      if (typeof raw === 'string') return raw
      return raw != null ? JSON.stringify(raw) : null
    case 'urlencoded':
      return buildUrlencodedBody((body.urlencoded as Record<string, unknown>[]) ?? [])
    case 'formdata':
      return buildFormdataBody((body.formdata as Record<string, unknown>[]) ?? [])
    case 'graphql':
      return JSON.stringify(body.graphql ?? {})
    default:
      return null
  }
}

function buildUrlencodedBody(params: Record<string, unknown>[]): string {
  const data = params
    .filter((p) => !(p.disabled ?? false))
    .map((p) => ({
      key: stringify(p.key ?? ''),
      value: stringify(p.value ?? ''),
    }))
  return JSON.stringify(data)
}

function buildFormdataBody(params: Record<string, unknown>[]): string {
  const data = params
    .filter((p) => !(p.disabled ?? false) && (p.type ?? 'text') === 'text')
    .map((p) => ({
      key: stringify(p.key ?? ''),
      value: stringify(p.value ?? ''),
    }))
  return JSON.stringify(data)
}

function mapBodyType(body: Record<string, unknown>): string {
  const mode = (body.mode as string) ?? 'none'

  if (mode === 'raw') {
    const language = ((body.options as Record<string, Record<string, string>> | undefined)?.raw?.language) ?? 'json'
    switch (language) {
      case 'json': return 'json'
      case 'xml': return 'xml'
      default: return 'raw'
    }
  }

  switch (mode) {
    case 'urlencoded': return 'urlencoded'
    case 'formdata': return 'form-data'
    case 'graphql': return 'graphql'
    default: return 'none'
  }
}

function mapVariables(variables: Record<string, unknown>[]): { key: string; value: string; enabled: boolean }[] {
  return variables.map((v) => ({
    key: stringify(v.key ?? ''),
    value: stringify(v.value ?? ''),
    enabled: !(v.disabled ?? false),
  }))
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function generateUniqueCollectionName(baseName: string): string {
  const db = getDatabase()
  let name = baseName
  let counter = 1
  while (db.prepare('SELECT 1 FROM collections WHERE name = ?').get(name)) {
    counter++
    name = `${baseName} (${counter})`
  }
  return name
}

function generateUniqueEnvironmentName(baseName: string): string {
  const db = getDatabase()
  let name = baseName
  let counter = 1
  while (db.prepare('SELECT 1 FROM environments WHERE name = ?').get(name)) {
    counter++
    name = `${baseName} (${counter})`
  }
  return name
}
