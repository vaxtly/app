/**
 * Add performance indexes on updated_at columns and a CHECK constraint
 * ensuring vault-synced environments keep variables empty in the DB.
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 5,
  name: '005_indexes_and_constraints',

  up(db: Database.Database): void {
    // Item 19: Indexes on updated_at for time-based queries (dirty detection, sort by recent)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_collections_updated_at ON collections(updated_at)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_updated_at ON requests(updated_at)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_environments_updated_at ON environments(updated_at)`)

    // Item 20: CHECK constraint — when vault_synced=1, variables must be '[]'
    // SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we recreate the table.
    // Copy data, drop old, create new with constraint, copy back.
    db.exec(`
      CREATE TABLE IF NOT EXISTS environments_new (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT,
        name TEXT NOT NULL,
        variables TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 0,
        "order" INTEGER NOT NULL DEFAULT 0,
        vault_synced INTEGER NOT NULL DEFAULT 0,
        vault_path TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        CHECK (vault_synced = 0 OR variables = '[]')
      )
    `)

    // Ensure existing data conforms: clear variables for vault-synced envs
    db.exec(`UPDATE environments SET variables = '[]' WHERE vault_synced = 1 AND variables != '[]'`)

    db.exec(`INSERT INTO environments_new SELECT * FROM environments`)
    db.exec(`DROP TABLE environments`)
    db.exec(`ALTER TABLE environments_new RENAME TO environments`)

    // Recreate indexes on the new table
    db.exec(`CREATE INDEX IF NOT EXISTS idx_environments_workspace_id ON environments(workspace_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_environments_updated_at ON environments(updated_at)`)
  },
}

export default migration
