/**
 * Add parent_id to environments to support a single level of parent/child
 * inheritance (root env → child env). Children inherit variables from their
 * parent; child entries override on a per-key basis. ON DELETE SET NULL means
 * deleting a parent orphans children rather than cascading.
 *
 * Depth is capped at 2 (one parent, one child level). The cap is enforced in
 * the repository layer rather than via SQL constraints.
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 8,
  name: '008_environment_parent',

  up(db: Database.Database): void {
    db.exec(`
      ALTER TABLE environments
        ADD COLUMN parent_id TEXT REFERENCES environments(id) ON DELETE SET NULL
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS idx_environments_parent_id ON environments(parent_id)`)
  },
}

export default migration
