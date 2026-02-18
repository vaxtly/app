import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import type { Workspace } from '../../../shared/types/models'

export function create(data: { name: string; description?: string }): Workspace {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO workspaces (id, name, description, "order", created_at, updated_at)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX("order"), 0) + 1 FROM workspaces), ?, ?)
  `).run(id, data.name, data.description ?? null, now, now)

  return findById(id)!
}

export function findById(id: string): Workspace | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace | undefined
}

export function findAll(): Workspace[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM workspaces ORDER BY "order" ASC').all() as Workspace[]
}

export function update(id: string, data: Partial<Pick<Workspace, 'name' | 'description' | 'settings' | 'order'>>): Workspace | undefined {
  const db = getDatabase()
  const existing = findById(id)
  if (!existing) return undefined

  db.prepare(`
    UPDATE workspaces SET
      name = ?,
      description = ?,
      settings = ?,
      "order" = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.description ?? existing.description,
    data.settings ?? existing.settings,
    data.order ?? existing.order,
    new Date().toISOString(),
    id
  )

  return findById(id)!
}

export function remove(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
  return result.changes > 0
}

export function reorder(ids: string[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE workspaces SET "order" = ?, updated_at = ? WHERE id = ?')
  const now = new Date().toISOString()

  const run = db.transaction(() => {
    ids.forEach((id, index) => {
      stmt.run(index, now, id)
    })
  })

  run()
}
