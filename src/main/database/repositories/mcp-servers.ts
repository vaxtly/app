import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import type { McpServer } from '../../../shared/types/mcp'

export function create(data: {
  workspace_id: string
  name: string
  transport_type?: string
  command?: string
  args?: string
  env?: string
  cwd?: string
  url?: string
  headers?: string
}): McpServer {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO mcp_servers (id, workspace_id, name, transport_type, command, args, env, cwd, url, headers, "order", created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      (SELECT COALESCE(MAX("order"), 0) + 1 FROM mcp_servers WHERE workspace_id = ?),
      ?, ?)
  `).run(
    id,
    data.workspace_id,
    data.name,
    data.transport_type ?? 'stdio',
    data.command ?? null,
    data.args ?? null,
    data.env ?? null,
    data.cwd ?? null,
    data.url ?? null,
    data.headers ?? null,
    data.workspace_id,
    now,
    now
  )

  return findById(id)!
}

export function findById(id: string): McpServer | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as McpServer | undefined
}

export function findByWorkspace(workspaceId: string): McpServer[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM mcp_servers WHERE workspace_id = ? ORDER BY "order" ASC').all(workspaceId) as McpServer[]
}

export function findAll(): McpServer[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM mcp_servers ORDER BY "order" ASC').all() as McpServer[]
}

export function update(
  id: string,
  data: Partial<Omit<McpServer, 'id' | 'created_at'>>
): McpServer | undefined {
  const db = getDatabase()
  const existing = findById(id)
  if (!existing) return undefined

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
      "order" = ?,
      sync_enabled = ?,
      is_dirty = ?,
      remote_sha = ?,
      remote_synced_at = ?,
      file_shas = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.transport_type ?? existing.transport_type,
    data.command !== undefined ? data.command : existing.command,
    data.args !== undefined ? data.args : existing.args,
    data.env !== undefined ? data.env : existing.env,
    data.cwd !== undefined ? data.cwd : existing.cwd,
    data.url !== undefined ? data.url : existing.url,
    data.headers !== undefined ? data.headers : existing.headers,
    data.order ?? existing.order,
    data.sync_enabled ?? existing.sync_enabled,
    data.is_dirty ?? existing.is_dirty,
    data.remote_sha !== undefined ? data.remote_sha : existing.remote_sha,
    data.remote_synced_at !== undefined ? data.remote_synced_at : existing.remote_synced_at,
    data.file_shas !== undefined ? data.file_shas : existing.file_shas,
    new Date().toISOString(),
    id
  )

  return findById(id)!
}

export function remove(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  return result.changes > 0
}

export function unlinkSync(id: string): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE mcp_servers
    SET sync_enabled = 0, remote_sha = NULL, file_shas = NULL, remote_synced_at = NULL, is_dirty = 0, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id)
}

export function markDirty(id: string): void {
  const db = getDatabase()
  db.prepare('UPDATE mcp_servers SET is_dirty = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function findDirtyOrNew(workspaceId?: string): McpServer[] {
  const db = getDatabase()
  if (workspaceId) {
    return db.prepare(`
      SELECT * FROM mcp_servers
      WHERE sync_enabled = 1 AND workspace_id = ?
        AND (is_dirty = 1 OR remote_sha IS NULL)
      ORDER BY "order" ASC
    `).all(workspaceId) as McpServer[]
  }
  return db.prepare(`
    SELECT * FROM mcp_servers
    WHERE sync_enabled = 1
      AND (is_dirty = 1 OR remote_sha IS NULL)
    ORDER BY "order" ASC
  `).all() as McpServer[]
}

export function findSyncEnabled(workspaceId?: string): McpServer[] {
  const db = getDatabase()
  if (workspaceId) {
    return db.prepare(`
      SELECT * FROM mcp_servers
      WHERE sync_enabled = 1 AND workspace_id = ?
      ORDER BY "order" ASC
    `).all(workspaceId) as McpServer[]
  }
  return db.prepare(`
    SELECT * FROM mcp_servers WHERE sync_enabled = 1 ORDER BY "order" ASC
  `).all() as McpServer[]
}

export function reorder(ids: string[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE mcp_servers SET "order" = ?, updated_at = ? WHERE id = ?')
  const now = new Date().toISOString()

  const run = db.transaction(() => {
    ids.forEach((id, index) => {
      stmt.run(index, now, id)
    })
  })

  run()
}
