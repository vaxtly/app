import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { encryptValue, decryptValue } from '../../services/encryption'
import type { Environment, EnvironmentVariable } from '../../../shared/types/models'

const ENC_PREFIX = 'enc:'

function encryptVariables(json: string): string {
  if (!json || json === '[]') return json
  const vars: EnvironmentVariable[] = JSON.parse(json)
  return JSON.stringify(
    vars.map((v) => ({
      ...v,
      value: v.value ? ENC_PREFIX + encryptValue(v.value) : v.value,
    }))
  )
}

function decryptVariables(json: string): string {
  if (!json || json === '[]') return json
  const vars: EnvironmentVariable[] = JSON.parse(json)
  return JSON.stringify(
    vars.map((v) => {
      if (v.value && v.value.startsWith(ENC_PREFIX)) {
        try {
          return { ...v, value: decryptValue(v.value.slice(ENC_PREFIX.length)) }
        } catch {
          return v // corrupted — return as-is
        }
      }
      return v
    })
  )
}

function decryptEnvironment(env: Environment): Environment {
  return { ...env, variables: decryptVariables(env.variables) }
}

export function create(data: {
  name: string
  workspace_id?: string
  variables?: string
}): Environment {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  const variables = data.variables ? encryptVariables(data.variables) : '[]'

  db.prepare(`
    INSERT INTO environments (id, workspace_id, name, variables, "order", created_at, updated_at)
    VALUES (?, ?, ?, ?,
      (SELECT COALESCE(MAX("order"), 0) + 1 FROM environments WHERE workspace_id IS ?),
      ?, ?)
  `).run(id, data.workspace_id ?? null, data.name, variables, data.workspace_id ?? null, now, now)

  return findById(id)!
}

export function findById(id: string): Environment | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as Environment | undefined
  return row ? decryptEnvironment(row) : undefined
}

export function findByWorkspace(workspaceId: string | null): Environment[] {
  const db = getDatabase()
  const rows = workspaceId
    ? db.prepare('SELECT * FROM environments WHERE workspace_id = ? ORDER BY "order" ASC').all(workspaceId) as Environment[]
    : db.prepare('SELECT * FROM environments WHERE workspace_id IS NULL ORDER BY "order" ASC').all() as Environment[]
  return rows.map(decryptEnvironment)
}

export function findAll(): Environment[] {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM environments ORDER BY "order" ASC').all() as Environment[]).map(decryptEnvironment)
}

export function findActive(workspaceId?: string): Environment | undefined {
  const db = getDatabase()
  const row = workspaceId
    ? db.prepare('SELECT * FROM environments WHERE is_active = 1 AND workspace_id = ? LIMIT 1').get(workspaceId) as Environment | undefined
    : db.prepare('SELECT * FROM environments WHERE is_active = 1 LIMIT 1').get() as Environment | undefined
  return row ? decryptEnvironment(row) : undefined
}

export function update(
  id: string,
  data: Partial<Omit<Environment, 'id' | 'created_at'>>
): Environment | undefined {
  const db = getDatabase()
  const existing = findById(id)
  if (!existing) return undefined

  // Re-encrypt variables if provided; existing.variables is already decrypted by findById
  const variables = data.variables
    ? encryptVariables(data.variables)
    : encryptVariables(existing.variables)

  db.prepare(`
    UPDATE environments SET
      workspace_id = ?,
      name = ?,
      variables = ?,
      is_active = ?,
      "order" = ?,
      vault_synced = ?,
      vault_path = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.workspace_id ?? existing.workspace_id,
    data.name ?? existing.name,
    variables,
    data.is_active ?? existing.is_active,
    data.order ?? existing.order,
    data.vault_synced ?? existing.vault_synced,
    data.vault_path ?? existing.vault_path,
    new Date().toISOString(),
    id
  )

  return findById(id)!
}

export function activate(id: string, workspaceId?: string): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  const run = db.transaction(() => {
    // Deactivate all in same workspace
    if (workspaceId) {
      db.prepare('UPDATE environments SET is_active = 0, updated_at = ? WHERE workspace_id = ?').run(now, workspaceId)
    } else {
      db.prepare('UPDATE environments SET is_active = 0, updated_at = ? WHERE workspace_id IS NULL').run(now)
    }
    // Activate the target
    db.prepare('UPDATE environments SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id)
  })

  run()
}

export function deactivate(id: string): void {
  const db = getDatabase()
  db.prepare('UPDATE environments SET is_active = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function remove(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM environments WHERE id = ?').run(id)
  return result.changes > 0
}

export function reorder(ids: string[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE environments SET "order" = ?, updated_at = ? WHERE id = ?')
  const now = new Date().toISOString()

  const run = db.transaction(() => {
    ids.forEach((id, index) => {
      stmt.run(index, now, id)
    })
  })

  run()
}
