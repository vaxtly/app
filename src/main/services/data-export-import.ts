/**
 * Data export/import service — export/import collections, environments, and config.
 * Export format: { vaxtly_export: true, version: 1, type, exported_at, data }
 */

import { getDatabase } from '../database/connection'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as requestsRepo from '../database/repositories/requests'
import * as environmentsRepo from '../database/repositories/environments'
import * as settingsRepo from '../database/repositories/settings'
import * as workspacesRepo from '../database/repositories/workspaces'
import type { Collection, Folder, Request as Req, Environment } from '../../shared/types/models'

// --- Export types ---

interface ExportWrapper {
  vaxtly_export: true
  version: number
  type: string
  exported_at: string
  data: Record<string, unknown>
}

interface CollectionExport {
  name: string
  description: string | null
  order: number
  variables: unknown
  folders: FolderExport[]
  requests: RequestExport[]
}

interface FolderExport {
  name: string
  order: number
  environment_ids?: string | null
  default_environment_id?: string | null
  children: FolderExport[]
  requests: RequestExport[]
}

interface RequestExport {
  name: string
  method: string
  url: string
  headers: unknown
  query_params: unknown
  body: string | null
  body_type: string
  scripts: string | null
  auth: string | null
  order: number
}

interface EnvironmentExport {
  name: string
  order: number
  is_active: number
  vault_synced: number
  vault_path: string | null
  variables: unknown
}

interface ImportResult {
  collections: number
  environments: number
  config: boolean
  errors: string[]
}

// --- Export functions ---

export function exportAll(workspaceId?: string): ExportWrapper {
  return wrap('all', {
    collections: buildCollectionsData(workspaceId),
    environments: buildEnvironmentsData(workspaceId),
    config: buildConfigData(workspaceId),
  })
}

export function exportCollections(workspaceId?: string): ExportWrapper {
  return wrap('collections', {
    collections: buildCollectionsData(workspaceId),
  })
}

export function exportSingleCollection(collectionId: string): ExportWrapper {
  const collection = collectionsRepo.findById(collectionId)
  if (!collection) throw new Error(`Collection not found: ${collectionId}`)

  const folders = foldersRepo.findByCollection(collection.id)
  const rootRequests = requestsRepo.findByFolder(null, collection.id)

  const data: CollectionExport = {
    name: collection.name,
    description: collection.description,
    order: collection.order,
    variables: collection.variables ? safeJsonParse(collection.variables, []) : [],
    folders: buildFoldersTree(collection.id, folders, null),
    requests: buildRequestsData(rootRequests),
  }

  return wrap('collections', { collections: [data] })
}

export function exportEnvironments(workspaceId?: string): ExportWrapper {
  return wrap('environments', {
    environments: buildEnvironmentsData(workspaceId),
  })
}

export function exportConfig(): ExportWrapper {
  return wrap('config', {
    config: buildConfigData(),
  })
}

// --- Import functions ---

export function importData(json: string, workspaceId?: string): ImportResult {
  const result: ImportResult = { collections: 0, environments: 0, config: false, errors: [] }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    result.errors.push('Invalid JSON')
    return result
  }

  if (!data.vaxtly_export || !data.version || !('data' in data)) {
    result.errors.push('Invalid Vaxtly export format')
    return result
  }

  if ((data.version as number) > 1) {
    result.errors.push(`Unsupported export version: ${data.version}`)
    return result
  }

  const exportData = data.data as Record<string, unknown>
  const type = (data.type as string) ?? 'all'

  if (['all', 'collections'].includes(type) && exportData.collections) {
    const r = importCollections(exportData.collections as CollectionExport[], workspaceId)
    result.collections = r.count
    result.errors.push(...r.errors)
  }

  if (['all', 'environments'].includes(type) && exportData.environments) {
    const r = importEnvironments(exportData.environments as EnvironmentExport[], workspaceId)
    result.environments = r.count
    result.errors.push(...r.errors)
  }

  if (['all', 'config'].includes(type) && exportData.config) {
    const r = importConfig(exportData.config as Record<string, Record<string, unknown>>, workspaceId)
    result.config = r.success
    result.errors.push(...r.errors)
  }

  return result
}

// --- Private helpers ---

function importCollections(
  collections: CollectionExport[],
  workspaceId?: string,
): { count: number; errors: string[] } {
  const db = getDatabase()
  let count = 0
  const errors: string[] = []

  for (const collData of collections) {
    try {
      const txn = db.transaction(() => {
        const collection = collectionsRepo.create({
          name: generateUniqueCollectionName(collData.name ?? 'Imported Collection', workspaceId),
          workspace_id: workspaceId,
          description: collData.description ?? undefined,
        })

        if (collData.variables) {
          collectionsRepo.update(collection.id, {
            variables: typeof collData.variables === 'string'
              ? collData.variables
              : JSON.stringify(collData.variables),
          })
        }

        importFolders(collData.folders ?? [], collection.id, null)
        importRequests(collData.requests ?? [], collection.id, null)
      })

      txn()
      count++
    } catch (e) {
      const name = collData.name ?? 'Unknown'
      errors.push(`Failed to import collection '${name}': ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { count, errors }
}

function importFolders(folders: FolderExport[], collectionId: string, parentId: string | null): void {
  for (const folderData of folders) {
    const folder = foldersRepo.create({
      collection_id: collectionId,
      name: folderData.name ?? 'Unnamed Folder',
      parent_id: parentId ?? undefined,
    })

    if (folderData.environment_ids || folderData.default_environment_id) {
      foldersRepo.update(folder.id, {
        environment_ids: folderData.environment_ids ?? undefined,
        default_environment_id: folderData.default_environment_id ?? undefined,
      })
    }

    importFolders(folderData.children ?? [], collectionId, folder.id)
    importRequests(folderData.requests ?? [], collectionId, folder.id)
  }
}

function importRequests(requests: RequestExport[], collectionId: string, folderId: string | null): void {
  for (const reqData of requests) {
    const request = requestsRepo.create({
      collection_id: collectionId,
      name: reqData.name ?? 'Unnamed Request',
      folder_id: folderId ?? undefined,
      method: reqData.method ?? 'GET',
      url: reqData.url ?? '',
      body_type: reqData.body_type ?? 'none',
    })

    // Update with remaining fields
    const updateData: Partial<Req> = {}
    if (reqData.headers) {
      updateData.headers = typeof reqData.headers === 'string' ? reqData.headers : JSON.stringify(reqData.headers)
    }
    if (reqData.query_params) {
      updateData.query_params = typeof reqData.query_params === 'string' ? reqData.query_params : JSON.stringify(reqData.query_params)
    }
    if (reqData.body !== null && reqData.body !== undefined) {
      updateData.body = reqData.body
    }
    if (reqData.scripts) {
      updateData.scripts = typeof reqData.scripts === 'string' ? reqData.scripts : JSON.stringify(reqData.scripts)
    }
    if (reqData.auth) {
      updateData.auth = typeof reqData.auth === 'string' ? reqData.auth : JSON.stringify(reqData.auth)
    }

    if (Object.keys(updateData).length > 0) {
      requestsRepo.update(request.id, updateData)
    }
  }
}

function importEnvironments(
  environments: EnvironmentExport[],
  workspaceId?: string,
): { count: number; errors: string[] } {
  let count = 0
  const errors: string[] = []

  for (const envData of environments) {
    try {
      const env = environmentsRepo.create({
        name: generateUniqueEnvironmentName(envData.name ?? 'Imported Environment', workspaceId),
        workspace_id: workspaceId,
        variables: typeof envData.variables === 'string'
          ? envData.variables
          : JSON.stringify(envData.variables ?? []),
      })

      if (envData.vault_synced || envData.vault_path) {
        environmentsRepo.update(env.id, {
          vault_synced: envData.vault_synced ?? 0,
          vault_path: envData.vault_path ?? null,
        })
      }

      count++
    } catch (e) {
      const name = envData.name ?? 'Unknown'
      errors.push(`Failed to import environment '${name}': ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { count, errors }
}

function importConfig(config: Record<string, Record<string, unknown>>, workspaceId?: string): { success: boolean; errors: string[] } {
  const errors: string[] = []

  function set(key: string, value: string): void {
    if (workspaceId) {
      workspacesRepo.setWorkspaceSetting(workspaceId, key, value)
    } else {
      settingsRepo.setSetting(key, value)
    }
  }

  try {
    if (config.remote) {
      const remote = config.remote
      if (remote.provider) set('sync.provider', String(remote.provider))
      if (remote.repository) set('sync.repository', String(remote.repository))
      if (remote.branch !== undefined) set('sync.branch', String(remote.branch))
      if (remote.auto_sync !== undefined) set('sync.auto_sync', remote.auto_sync ? '1' : '0')
    }

    if (config.vault) {
      const vault = config.vault
      if (vault.provider) set('vault.provider', String(vault.provider))
      if (vault.url) set('vault.url', String(vault.url))
      if (vault.auth_method !== undefined) set('vault.auth_method', String(vault.auth_method))
      if (vault.namespace !== undefined) set('vault.namespace', String(vault.namespace))
      if (vault.mount !== undefined) set('vault.mount', String(vault.mount))
      if (vault.verify_ssl !== undefined) set('vault.verify_ssl', vault.verify_ssl ? '1' : '0')
      if (vault.auto_sync !== undefined) set('vault.auto_sync', vault.auto_sync ? '1' : '0')
      if (vault.aws_region) set('vault.aws_region', String(vault.aws_region))
      if (vault.aws_profile) set('vault.aws_profile', String(vault.aws_profile))
    }

    return { success: true, errors }
  } catch (e) {
    errors.push(`Failed to import config: ${e instanceof Error ? e.message : String(e)}`)
    return { success: false, errors }
  }
}

function buildCollectionsData(workspaceId?: string): CollectionExport[] {
  const collections = workspaceId
    ? collectionsRepo.findByWorkspace(workspaceId)
    : collectionsRepo.findAll()

  return collections.map((collection) => {
    const folders = foldersRepo.findByCollection(collection.id)
    const rootRequests = requestsRepo.findByFolder(null, collection.id)

    return {
      name: collection.name,
      description: collection.description,
      order: collection.order,
      variables: collection.variables ? safeJsonParse(collection.variables, []) : [],
      folders: buildFoldersTree(collection.id, folders, null),
      requests: buildRequestsData(rootRequests),
    }
  })
}

function buildFoldersTree(collectionId: string, allFolders: Folder[], parentId: string | null): FolderExport[] {
  const children = allFolders.filter((f) =>
    parentId ? f.parent_id === parentId : !f.parent_id,
  )

  return children.map((folder) => {
    const requests = requestsRepo.findByFolder(folder.id, collectionId)
    const data: FolderExport = {
      name: folder.name,
      order: folder.order,
      children: buildFoldersTree(collectionId, allFolders, folder.id),
      requests: buildRequestsData(requests),
    }

    if (folder.environment_ids) {
      data.environment_ids = folder.environment_ids
      data.default_environment_id = folder.default_environment_id
    }

    return data
  })
}

function buildRequestsData(requests: Req[]): RequestExport[] {
  return requests.map((request) => ({
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers ? safeJsonParse(request.headers, []) : [],
    query_params: request.query_params ? safeJsonParse(request.query_params, []) : [],
    body: request.body,
    body_type: request.body_type,
    scripts: request.scripts,
    auth: request.auth,
    order: request.order,
  }))
}

function buildEnvironmentsData(workspaceId?: string): EnvironmentExport[] {
  const environments = workspaceId
    ? environmentsRepo.findByWorkspace(workspaceId)
    : environmentsRepo.findAll()

  return environments.map((env) => ({
    name: env.name,
    order: env.order,
    is_active: env.is_active,
    vault_synced: env.vault_synced ?? 0,
    vault_path: env.vault_path,
    variables: env.vault_synced ? [] : safeJsonParse(env.variables, []),
  }))
}

function buildConfigData(workspaceId?: string): { remote: Record<string, unknown>; vault: Record<string, unknown> } {
  function get(key: string): string | undefined {
    if (workspaceId) {
      const wsVal = workspacesRepo.getWorkspaceSetting(workspaceId, key)
      if (wsVal !== undefined) return wsVal
    }
    return settingsRepo.getSetting(key)
  }

  return {
    remote: {
      provider: get('sync.provider') ?? '',
      repository: get('sync.repository') ?? '',
      branch: get('sync.branch') ?? 'main',
      auto_sync: get('sync.auto_sync') === '1',
    },
    vault: {
      provider: get('vault.provider') ?? '',
      url: get('vault.url') ?? '',
      auth_method: get('vault.auth_method') ?? 'token',
      namespace: get('vault.namespace') ?? '',
      mount: get('vault.mount') ?? 'secret',
      verify_ssl: get('vault.verify_ssl') !== '0',
      auto_sync: get('vault.auto_sync') !== '0',
      aws_region: get('vault.aws_region') ?? '',
      aws_profile: get('vault.aws_profile') ?? '',
    },
  }
}

function wrap(type: string, data: Record<string, unknown>): ExportWrapper {
  return {
    vaxtly_export: true,
    version: 1,
    type,
    exported_at: new Date().toISOString(),
    data,
  }
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

function safeJsonParse(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
