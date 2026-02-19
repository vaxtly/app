import { getDatabase } from '../connection'
import { encryptValue, decryptValue } from '../../services/encryption'
import type { AppSetting, WindowState } from '../../../shared/types/models'

// --- App Settings ---

const SENSITIVE_KEYS = new Set([
  'vault.token',
  'vault.role_id',
  'vault.secret_id',
  'sync.token',
])

export function getSetting(key: string): string | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row?.value) return row?.value
  if (SENSITIVE_KEYS.has(key)) {
    try {
      return decryptValue(row.value)
    } catch {
      // Value is still plaintext (pre-migration) — return as-is
      return row.value
    }
  }
  return row.value
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase()
  const stored = SENSITIVE_KEYS.has(key) ? encryptValue(value) : value
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, stored)
}

export function getAllSettings(): AppSetting[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM app_settings').all() as AppSetting[]
  return rows.map((row) => {
    if (SENSITIVE_KEYS.has(row.key)) {
      try {
        return { ...row, value: decryptValue(row.value) }
      } catch {
        return row // plaintext pre-migration
      }
    }
    return row
  })
}

export function removeSetting(key: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
  return result.changes > 0
}

// --- Window State ---

export function getWindowState(): WindowState {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM window_state WHERE id = 1').get() as
    | (WindowState & { id: number })
    | undefined

  if (!row) {
    return { x: null, y: null, width: 1200, height: 800, is_maximized: 0 }
  }

  return {
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    is_maximized: row.is_maximized,
  }
}

export function saveWindowState(state: WindowState): void {
  const db = getDatabase()
  const existing = db.prepare('SELECT id FROM window_state WHERE id = 1').get()

  if (existing) {
    db.prepare(
      'UPDATE window_state SET x = ?, y = ?, width = ?, height = ?, is_maximized = ? WHERE id = 1'
    ).run(state.x, state.y, state.width, state.height, state.is_maximized)
  } else {
    db.prepare(
      'INSERT INTO window_state (id, x, y, width, height, is_maximized) VALUES (1, ?, ?, ?, ?, ?)'
    ).run(state.x, state.y, state.width, state.height, state.is_maximized)
  }
}
