import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import type { Collection } from '../../../shared/types/models'

export function create(data: { name: string; workspace_id?: string; description?: string }): Collection {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO collections (id, workspace_id, name, description, "order", created_at, updated_at)
    VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX("order"), 0) + 1 FROM collections WHERE workspace_id IS ?), ?, ?)
  `).run(id, data.workspace_id ?? null, data.name, data.description ?? null, data.workspace_id ?? null, now, now)

  return findById(id)!
}

export function findById(id: string): Collection | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as Collection | undefined
}

export function findByWorkspace(workspaceId: string | null): Collection[] {
  const db = getDatabase()
  if (workspaceId) {
    return db.prepare('SELECT * FROM collections WHERE workspace_id = ? ORDER BY "order" ASC').all(workspaceId) as Collection[]
  }
  return db.prepare('SELECT * FROM collections WHERE workspace_id IS NULL ORDER BY "order" ASC').all() as Collection[]
}

export function findAll(): Collection[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM collections ORDER BY "order" ASC').all() as Collection[]
}

export function update(id: string, data: Partial<Omit<Collection, 'id' | 'created_at'>>): Collection | undefined {
  const db = getDatabase()
  const existing = findById(id)
  if (!existing) return undefined

  db.prepare(`
    UPDATE collections SET
      workspace_id = ?,
      name = ?,
      description = ?,
      "order" = ?,
      variables = ?,
      remote_sha = ?,
      remote_synced_at = ?,
      is_dirty = ?,
      sync_enabled = ?,
      environment_ids = ?,
      default_environment_id = ?,
      file_shas = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.workspace_id ?? existing.workspace_id,
    data.name ?? existing.name,
    data.description ?? existing.description,
    data.order ?? existing.order,
    data.variables ?? existing.variables,
    data.remote_sha ?? existing.remote_sha,
    data.remote_synced_at ?? existing.remote_synced_at,
    data.is_dirty ?? existing.is_dirty,
    data.sync_enabled ?? existing.sync_enabled,
    data.environment_ids ?? existing.environment_ids,
    data.default_environment_id ?? existing.default_environment_id,
    data.file_shas ?? existing.file_shas,
    new Date().toISOString(),
    id
  )

  return findById(id)!
}

export function remove(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM collections WHERE id = ?').run(id)
  return result.changes > 0
}

export function reorder(ids: string[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE collections SET "order" = ?, updated_at = ? WHERE id = ?')
  const now = new Date().toISOString()

  const run = db.transaction(() => {
    ids.forEach((id, index) => {
      stmt.run(index, now, id)
    })
  })

  run()
}

export function markDirty(id: string): void {
  const db = getDatabase()
  db.prepare('UPDATE collections SET is_dirty = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function clearDirty(id: string): void {
  const db = getDatabase()
  db.prepare('UPDATE collections SET is_dirty = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}
