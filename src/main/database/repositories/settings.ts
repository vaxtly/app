import { getDatabase } from '../connection'
import type { AppSetting, WindowState } from '../../../shared/types/models'

// --- App Settings ---

export function getSetting(key: string): string | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

export function getAllSettings(): AppSetting[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM app_settings').all() as AppSetting[]
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
