/**
 * Add sync columns to mcp_servers table (same pattern as collection sync fields).
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 3,
  name: '003_mcp_sync_fields',

  up(db: Database.Database): void {
    db.exec(`ALTER TABLE mcp_servers ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0`)
    db.exec(`ALTER TABLE mcp_servers ADD COLUMN is_dirty INTEGER NOT NULL DEFAULT 0`)
    db.exec(`ALTER TABLE mcp_servers ADD COLUMN remote_sha TEXT`)
    db.exec(`ALTER TABLE mcp_servers ADD COLUMN remote_synced_at TEXT`)
    db.exec(`ALTER TABLE mcp_servers ADD COLUMN file_shas TEXT`)
  },
}

export default migration
