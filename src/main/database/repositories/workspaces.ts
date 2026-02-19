import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { encryptValue, decryptValue } from '../../services/encryption'
import type { Workspace } from '../../../shared/types/models'

// Keys within workspace settings that contain sensitive data
const SENSITIVE_KEYS = new Set([
  'sync.token',
  'vault.token',
  'vault.role_id',
  'vault.secret_id',
])

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

// --- Workspace-scoped settings ---

type WorkspaceSettings = Record<string, Record<string, unknown>>

function isSensitiveKey(domain: string, key: string): boolean {
  return SENSITIVE_KEYS.has(`${domain}.${key}`)
}

function decryptSettings(settings: WorkspaceSettings): WorkspaceSettings {
  const result: WorkspaceSettings = {}
  for (const [domain, entries] of Object.entries(settings)) {
    result[domain] = {}
    for (const [key, value] of Object.entries(entries)) {
      if (isSensitiveKey(domain, key) && typeof value === 'string' && value) {
        try {
          result[domain][key] = decryptValue(value)
        } catch {
          result[domain][key] = value // plaintext pre-migration
        }
      } else {
        result[domain][key] = value
      }
    }
  }
  return result
}

function encryptSettings(settings: WorkspaceSettings): WorkspaceSettings {
  const result: WorkspaceSettings = {}
  for (const [domain, entries] of Object.entries(settings)) {
    result[domain] = {}
    for (const [key, value] of Object.entries(entries)) {
      if (isSensitiveKey(domain, key) && typeof value === 'string' && value) {
        result[domain][key] = encryptValue(value)
      } else {
        result[domain][key] = value
      }
    }
  }
  return result
}

export function getWorkspaceSettings(workspaceId: string): WorkspaceSettings {
  const workspace = findById(workspaceId)
  if (!workspace?.settings) return {}

  try {
    const parsed = JSON.parse(workspace.settings) as WorkspaceSettings
    return decryptSettings(parsed)
  } catch {
    return {}
  }
}

export function setWorkspaceSettings(workspaceId: string, settings: WorkspaceSettings): void {
  const encrypted = encryptSettings(settings)
  update(workspaceId, { settings: JSON.stringify(encrypted) })
}

export function getWorkspaceSetting(workspaceId: string, key: string): string | undefined {
  const [domain, ...rest] = key.split('.')
  const field = rest.join('.')
  if (!domain || !field) return undefined

  const settings = getWorkspaceSettings(workspaceId)
  const value = settings[domain]?.[field]
  return value !== undefined && value !== null ? String(value) : undefined
}

export function setWorkspaceSetting(workspaceId: string, key: string, value: string): void {
  const [domain, ...rest] = key.split('.')
  const field = rest.join('.')
  if (!domain || !field) return

  const settings = getWorkspaceSettings(workspaceId)
  if (!settings[domain]) settings[domain] = {}
  settings[domain][field] = value
  setWorkspaceSettings(workspaceId, settings)
}
