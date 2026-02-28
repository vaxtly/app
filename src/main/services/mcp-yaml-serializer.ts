/**
 * MCP YAML Serializer — serialize/import MCP servers to/from YAML file maps.
 *
 * Directory structure in remote repo:
 *   mcp-servers/_manifest.yaml       (ordering)
 *   mcp-servers/{server_uuid}.yaml   (one per server)
 */

import yaml from 'js-yaml'
import { getDatabase } from '../database/connection'
import * as mcpServersRepo from '../database/repositories/mcp-servers'
import type { McpServer } from '../../shared/types/mcp'
import type { FileContent } from '../../shared/types/sync'
import { sanitizeMcpServerData } from './sensitive-data-scanner'

const MANIFEST_FILE = '_manifest.yaml'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`Invalid UUID for ${label}: ${String(value).slice(0, 40)}`)
  }
  return value
}

interface SerializeOptions {
  sanitize?: boolean
}

// --- YAML helpers ---

function toYaml(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  })
}

function parseYaml(content: string): Record<string, unknown> {
  const result = yaml.load(content)
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid or empty YAML content')
  }
  return result as Record<string, unknown>
}

// --- Serialization ---

export function serializeMcpServer(server: McpServer, options: SerializeOptions = {}): string {
  let data: Record<string, unknown> = {
    id: server.id,
    name: server.name,
    transport_type: server.transport_type,
  }

  if (server.transport_type === 'stdio') {
    data.command = server.command
    data.args = parseJsonArray(server.args) ?? []
    data.env = parseJsonObject(server.env) ?? {}
    if (server.cwd) data.cwd = server.cwd
  } else {
    data.url = server.url
    data.headers = parseJsonObject(server.headers) ?? {}
  }

  if (options.sanitize) {
    data = sanitizeMcpServerData(data)
  }

  return toYaml(data)
}

export function serializeMcpServersDirectory(
  servers: McpServer[],
  options: SerializeOptions = {},
): Record<string, string> {
  const files: Record<string, string> = {}

  // Individual server files
  for (const server of servers) {
    files[`${server.id}.yaml`] = serializeMcpServer(server, options)
  }

  // Manifest for ordering
  const manifest = {
    items: servers.map((s) => ({ id: s.id })),
  }
  files[MANIFEST_FILE] = toYaml(manifest)

  return files
}

// --- Import ---

export function importMcpServerFromYaml(content: string, workspaceId: string): string {
  const data = parseYaml(content)
  assertUuid(data.id, 'mcp_server')
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = data.id as string

  const existing = mcpServersRepo.findById(id)

  // Build env/args/headers as JSON strings
  const env = data.env && typeof data.env === 'object' && Object.keys(data.env as object).length > 0
    ? JSON.stringify(data.env)
    : null
  const args = Array.isArray(data.args) && (data.args as unknown[]).length > 0
    ? JSON.stringify(data.args)
    : null
  const headers = data.headers && typeof data.headers === 'object' && Object.keys(data.headers as object).length > 0
    ? JSON.stringify(data.headers)
    : null

  if (existing) {
    // Upsert: update existing server
    db.prepare(`
      UPDATE mcp_servers SET
        name = ?,
        transport_type = ?,
        command = ?,
        args = ?,
        env = ?,
        cwd = ?,
        url = ?,
        headers = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      data.name as string,
      (data.transport_type as string) ?? 'stdio',
      (data.command as string) ?? null,
      args,
      env,
      (data.cwd as string) ?? null,
      (data.url as string) ?? null,
      headers,
      now,
      id,
    )
  } else {
    // Insert new server
    const maxOrder = (db.prepare(
      'SELECT COALESCE(MAX("order"), 0) as max_order FROM mcp_servers WHERE workspace_id = ?',
    ).get(workspaceId) as { max_order: number }).max_order

    db.prepare(`
      INSERT INTO mcp_servers (id, workspace_id, name, transport_type, command, args, env, cwd, url, headers, "order", sync_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      workspaceId,
      data.name as string,
      (data.transport_type as string) ?? 'stdio',
      (data.command as string) ?? null,
      args,
      env,
      (data.cwd as string) ?? null,
      (data.url as string) ?? null,
      headers,
      maxOrder + 1,
      now,
      now,
    )
  }

  return id
}

export function importMcpServersFromDirectory(
  files: FileContent[],
  workspaceId: string,
): string[] {
  const db = getDatabase()
  const filesByPath = new Map<string, string>()
  for (const file of files) {
    // Normalize: strip "mcp-servers/" prefix if present
    const normalizedPath = file.path.replace(/^mcp-servers\//, '')
    filesByPath.set(normalizedPath, file.content)
  }

  // Parse manifest for ordering
  const manifestContent = filesByPath.get(MANIFEST_FILE)
  let orderedIds: string[] = []
  if (manifestContent) {
    const manifest = parseYaml(manifestContent) as { items?: Array<{ id: string }> }
    orderedIds = (manifest.items ?? []).map((item) => item.id)
  }

  // Import servers in manifest order, then any remaining files
  const importedIds: string[] = []
  const processedFiles = new Set<string>()

  const run = db.transaction(() => {
    // First: import in manifest order
    for (const id of orderedIds) {
      const fileName = `${id}.yaml`
      const content = filesByPath.get(fileName)
      if (content) {
        importMcpServerFromYaml(content, workspaceId)
        importedIds.push(id)
        processedFiles.add(fileName)
      }
    }

    // Then: import any files not in manifest
    for (const [path, content] of filesByPath) {
      if (path === MANIFEST_FILE || processedFiles.has(path)) continue
      if (!path.endsWith('.yaml')) continue
      try {
        const id = importMcpServerFromYaml(content, workspaceId)
        importedIds.push(id)
      } catch {
        // Skip malformed files
      }
    }

    // Apply manifest ordering
    if (orderedIds.length > 0) {
      const stmt = db.prepare('UPDATE mcp_servers SET "order" = ? WHERE id = ?')
      orderedIds.forEach((id, index) => {
        stmt.run(index, id)
      })
    }
  })

  run()
  return importedIds
}

// --- JSON helpers ---

function parseJsonArray(jsonStr: string | null): unknown[] | null {
  if (!jsonStr) return null
  try {
    const parsed = JSON.parse(jsonStr)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseJsonObject(jsonStr: string | null): Record<string, unknown> | null {
  if (!jsonStr) return null
  try {
    const parsed = JSON.parse(jsonStr)
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
