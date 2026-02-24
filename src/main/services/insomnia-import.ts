/**
 * Insomnia import service — imports collections, requests, folders, and environments
 * from Insomnia v4 JSON export format.
 */

import { getDatabase } from '../database/connection'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as requestsRepo from '../database/repositories/requests'
import * as environmentsRepo from '../database/repositories/environments'
import type { Folder } from '../../shared/types/models'

export interface InsomniaImportResult {
  collections: number
  requests: number
  folders: number
  environments: number
  errors: string[]
}

/**
 * Import from an Insomnia v4 JSON string.
 */
export function importInsomnia(json: string, workspaceId?: string): InsomniaImportResult {
  const result: InsomniaImportResult = {
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

  if (data._type !== 'export' || typeof data.__export_format !== 'number') {
    result.errors.push('Not an Insomnia export file')
    return result
  }

  const resources = data.resources as Record<string, unknown>[]
  if (!Array.isArray(resources)) {
    result.errors.push('No resources found in export')
    return result
  }

  processResources(resources, result, workspaceId)
  return result
}

// --- Processing ---

function processResources(
  resources: Record<string, unknown>[],
  result: InsomniaImportResult,
  workspaceId?: string,
): void {
  // Group resources by type
  const workspaces = resources.filter((r) => r._type === 'workspace')
  const requestGroups = resources.filter((r) => r._type === 'request_group')
  const requests = resources.filter((r) => r._type === 'request')
  const environments = resources.filter((r) => r._type === 'environment')

  const db = getDatabase()

  // Process each workspace as a collection
  for (const ws of workspaces) {
    try {
      const txn = db.transaction(() => {
        const wsId = ws._id as string
        const name = (ws.name as string) ?? 'Imported Collection'

        const collection = collectionsRepo.create({
          name: generateUniqueCollectionName(name, workspaceId),
          workspace_id: workspaceId,
          description: (ws.description as string) ?? undefined,
        })
        result.collections++

        // Build folders for this workspace
        const folderMap = createFolders(requestGroups, wsId, collection.id, result)

        // Create requests belonging to this workspace
        createRequests(requests, wsId, collection.id, folderMap, result)
      })
      txn()
    } catch (e) {
      result.errors.push(`Failed to import workspace '${ws.name}': ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Process environments (skip base environments)
  for (const env of environments) {
    if (isBaseEnvironment(env)) continue
    parseEnvironment(env, result, workspaceId)
  }
}

function createFolders(
  requestGroups: Record<string, unknown>[],
  workspaceId: string,
  collectionId: string,
  result: InsomniaImportResult,
): Map<string, Folder> {
  const folderMap = new Map<string, Folder>()

  // Filter groups belonging to this workspace (directly or nested)
  const belongingGroups = requestGroups.filter((g) => {
    // Direct child of workspace
    if (g.parentId === workspaceId) return true
    // Child of another request_group — will be resolved via multi-pass
    const parent = requestGroups.find((p) => p._id === g.parentId)
    return !!parent
  })

  // Root folders: parentId is the workspace
  const rootGroups = belongingGroups.filter((g) => g.parentId === workspaceId)
  const childGroups = belongingGroups.filter((g) => g.parentId !== workspaceId)

  for (const group of rootGroups) {
    const folder = foldersRepo.create({
      collection_id: collectionId,
      name: (group.name as string) ?? 'Unnamed Folder',
    })
    folderMap.set(group._id as string, folder)
    result.folders++
  }

  // Multi-pass for nested folders
  let remaining = [...childGroups]
  let maxPasses = 10

  while (remaining.length > 0 && maxPasses-- > 0) {
    const unresolved: Record<string, unknown>[] = []

    for (const group of remaining) {
      const parentFolder = folderMap.get(group.parentId as string)
      if (parentFolder) {
        const folder = foldersRepo.create({
          collection_id: collectionId,
          name: (group.name as string) ?? 'Unnamed Folder',
          parent_id: parentFolder.id,
        })
        folderMap.set(group._id as string, folder)
        result.folders++
      } else {
        unresolved.push(group)
      }
    }

    remaining = unresolved
  }

  return folderMap
}

function createRequests(
  requests: Record<string, unknown>[],
  workspaceId: string,
  collectionId: string,
  folderMap: Map<string, Folder>,
  result: InsomniaImportResult,
): void {
  for (const req of requests) {
    // Only import requests belonging to this workspace or its folders
    const parentId = req.parentId as string
    if (parentId !== workspaceId && !folderMap.has(parentId)) continue

    const folder = folderMap.get(parentId)
    const method = ((req.method as string) ?? 'GET').toUpperCase()
    const url = (req.url as string) ?? ''
    const headers = extractHeaders(req)
    const queryParams = extractQueryParams(req)
    const { body, bodyType, formData } = extractBody(req)
    const auth = extractAuth(req)

    const request = requestsRepo.create({
      collection_id: collectionId,
      folder_id: folder?.id,
      name: (req.name as string) ?? 'Unnamed Request',
      method,
      url,
      body_type: bodyType,
    })

    const updates: Record<string, string | null> = {}
    if (headers.length > 0) updates.headers = JSON.stringify(headers)
    if (queryParams.length > 0) updates.query_params = JSON.stringify(queryParams)
    if (body) updates.body = body
    if (formData) updates.body = formData
    if (auth) updates.auth = JSON.stringify(auth)

    if (Object.keys(updates).length > 0) {
      requestsRepo.update(request.id, updates)
    }

    result.requests++
  }
}

// --- Field extraction ---

function extractHeaders(req: Record<string, unknown>): { key: string; value: string; enabled: boolean }[] {
  const headers = req.headers as Record<string, unknown>[] | undefined
  if (!Array.isArray(headers)) return []

  return headers
    .filter((h) => h.name)
    .map((h) => ({
      key: stringify(h.name),
      value: stringify(h.value ?? ''),
      enabled: !(h.disabled ?? false),
    }))
}

function extractQueryParams(req: Record<string, unknown>): { key: string; value: string; enabled: boolean }[] {
  const params = req.parameters as Record<string, unknown>[] | undefined
  if (!Array.isArray(params)) return []

  return params
    .filter((p) => p.name)
    .map((p) => ({
      key: stringify(p.name),
      value: stringify(p.value ?? ''),
      enabled: !(p.disabled ?? false),
    }))
}

function extractBody(req: Record<string, unknown>): {
  body: string | null
  bodyType: string
  formData: string | null
} {
  const bodyObj = req.body as Record<string, unknown> | undefined
  if (!bodyObj) return { body: null, bodyType: 'none', formData: null }

  const mimeType = (bodyObj.mimeType as string) ?? ''
  const text = bodyObj.text as string | undefined
  const params = bodyObj.params as Record<string, unknown>[] | undefined

  if (mimeType.includes('application/json')) {
    return { body: text ?? null, bodyType: 'json', formData: null }
  }

  if (mimeType.includes('application/xml') || mimeType.includes('text/xml')) {
    return { body: text ?? null, bodyType: 'xml', formData: null }
  }

  if (mimeType.includes('multipart/form-data')) {
    if (Array.isArray(params)) {
      const entries = params.map((p) => ({
        key: stringify(p.name ?? p.id ?? ''),
        value: stringify(p.value ?? p.fileName ?? ''),
        enabled: !(p.disabled ?? false),
      }))
      return { body: null, bodyType: 'form-data', formData: JSON.stringify(entries) }
    }
    return { body: text ?? null, bodyType: 'form-data', formData: null }
  }

  if (mimeType.includes('application/x-www-form-urlencoded')) {
    if (Array.isArray(params)) {
      const entries = params.map((p) => ({
        key: stringify(p.name ?? ''),
        value: stringify(p.value ?? ''),
        enabled: !(p.disabled ?? false),
      }))
      return { body: JSON.stringify(entries), bodyType: 'urlencoded', formData: null }
    }
    return { body: text ?? null, bodyType: 'urlencoded', formData: null }
  }

  if (mimeType.includes('application/graphql')) {
    return { body: text ?? null, bodyType: 'graphql', formData: null }
  }

  // Raw/other
  if (text) {
    return { body: text, bodyType: 'raw', formData: null }
  }

  return { body: null, bodyType: 'none', formData: null }
}

function extractAuth(req: Record<string, unknown>): Record<string, unknown> | null {
  const authObj = req.authentication as Record<string, unknown> | undefined
  if (!authObj || !authObj.type) return null

  const authType = authObj.type as string

  if (authType === 'bearer') {
    return {
      type: 'bearer',
      bearer_token: stringify(authObj.token ?? ''),
    }
  }

  if (authType === 'basic') {
    return {
      type: 'basic',
      basic_username: stringify(authObj.username ?? ''),
      basic_password: stringify(authObj.password ?? ''),
    }
  }

  if (authType === 'apikey') {
    return {
      type: 'api-key',
      api_key_header: stringify(authObj.key ?? 'X-API-Key'),
      api_key_value: stringify(authObj.value ?? ''),
    }
  }

  if (authType === 'oauth2') {
    const config: Record<string, unknown> = {
      type: 'oauth2',
      oauth2_access_token_url: stringify(authObj.accessTokenUrl ?? ''),
      oauth2_client_id: stringify(authObj.clientId ?? ''),
    }

    const grantType = authObj.grantType as string | undefined
    if (grantType === 'authorization_code') {
      config.oauth2_grant_type = 'authorization_code'
      config.oauth2_authorization_url = stringify(authObj.authorizationUrl ?? '')
    } else if (grantType === 'client_credentials') {
      config.oauth2_grant_type = 'client_credentials'
    } else if (grantType === 'password') {
      config.oauth2_grant_type = 'password'
    }

    if (authObj.clientSecret) config.oauth2_client_secret = stringify(authObj.clientSecret)
    if (authObj.scope) config.oauth2_scope = stringify(authObj.scope)
    if (authObj.redirectUrl) config.oauth2_redirect_url = stringify(authObj.redirectUrl)

    return config
  }

  return null
}

// --- Environment ---

function parseEnvironment(
  env: Record<string, unknown>,
  result: InsomniaImportResult,
  workspaceId?: string,
): void {
  const name = (env.name as string) ?? 'Imported Environment'
  const data = env.data as Record<string, unknown> | undefined

  if (!data || typeof data !== 'object') return

  const variables = Object.entries(data).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    enabled: true,
  }))

  try {
    environmentsRepo.create({
      name: generateUniqueEnvironmentName(name, workspaceId),
      workspace_id: workspaceId,
      variables: JSON.stringify(variables),
    })
    result.environments++
  } catch (e) {
    result.errors.push(`Failed to import environment '${name}': ${e instanceof Error ? e.message : String(e)}`)
  }
}

// --- Helpers ---

function isBaseEnvironment(env: Record<string, unknown>): boolean {
  const id = env._id as string | undefined
  const parentId = env.parentId as string | undefined
  if (id?.includes('base_env')) return true
  if (parentId === '__BASE_ENVIRONMENT_ID__') return true
  return false
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
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

function generateUniqueEnvironmentName(baseName: string, workspaceId?: string): string {
  const db = getDatabase()
  let name = baseName
  let counter = 1
  while (db.prepare('SELECT 1 FROM environments WHERE name = ? AND workspace_id IS ?').get(name, workspaceId ?? null)) {
    counter++
    name = `${baseName} (${counter})`
  }
  return name
}
