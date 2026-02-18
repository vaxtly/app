import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import type { Folder } from '../../../shared/types/models'

export function create(data: {
  collection_id: string
  name: string
  parent_id?: string
}): Folder {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO folders (id, collection_id, parent_id, name, "order", created_at, updated_at)
    VALUES (?, ?, ?, ?,
      (SELECT COALESCE(MAX("order"), 0) + 1 FROM folders
       WHERE collection_id = ? AND parent_id IS ?),
      ?, ?)
  `).run(
    id,
    data.collection_id,
    data.parent_id ?? null,
    data.name,
    data.collection_id,
    data.parent_id ?? null,
    now,
    now
  )

  return findById(id)!
}

export function findById(id: string): Folder | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Folder | undefined
}

export function findByCollection(collectionId: string): Folder[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM folders WHERE collection_id = ? ORDER BY "order" ASC')
    .all(collectionId) as Folder[]
}

export function findByParent(parentId: string | null, collectionId: string): Folder[] {
  const db = getDatabase()
  if (parentId) {
    return db
      .prepare('SELECT * FROM folders WHERE parent_id = ? AND collection_id = ? ORDER BY "order" ASC')
      .all(parentId, collectionId) as Folder[]
  }
  return db
    .prepare('SELECT * FROM folders WHERE parent_id IS NULL AND collection_id = ? ORDER BY "order" ASC')
    .all(collectionId) as Folder[]
}

export function update(
  id: string,
  data: Partial<Pick<Folder, 'name' | 'parent_id' | 'order' | 'environment_ids' | 'default_environment_id'>>
): Folder | undefined {
  const db = getDatabase()
  const existing = findById(id)
  if (!existing) return undefined

  db.prepare(`
    UPDATE folders SET
      name = ?,
      parent_id = ?,
      "order" = ?,
      environment_ids = ?,
      default_environment_id = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.parent_id !== undefined ? data.parent_id : existing.parent_id,
    data.order ?? existing.order,
    data.environment_ids ?? existing.environment_ids,
    data.default_environment_id ?? existing.default_environment_id,
    new Date().toISOString(),
    id
  )

  return findById(id)!
}

export function remove(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  return result.changes > 0
}

export function reorder(ids: string[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE folders SET "order" = ?, updated_at = ? WHERE id = ?')
  const now = new Date().toISOString()

  const run = db.transaction(() => {
    ids.forEach((id, index) => {
      stmt.run(index, now, id)
    })
  })

  run()
}
