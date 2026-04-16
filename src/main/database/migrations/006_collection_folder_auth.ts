/**
 * Add auth column to collections and folders tables for auth inheritance.
 * Requests can inherit auth from their parent folder or collection.
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 6,
  name: '006_collection_folder_auth',

  up(db: Database.Database): void {
    db.exec(`ALTER TABLE collections ADD COLUMN auth TEXT`)
    db.exec(`ALTER TABLE folders ADD COLUMN auth TEXT`)
  },
}

export default migration
