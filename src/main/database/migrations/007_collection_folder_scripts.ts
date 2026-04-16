/**
 * Add scripts column to collections and folders for pre-request/post-response
 * scripts at the collection/folder level (e.g., smart token fetching).
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 7,
  name: '007_collection_folder_scripts',

  up(db: Database.Database): void {
    db.exec(`ALTER TABLE collections ADD COLUMN scripts TEXT`)
    db.exec(`ALTER TABLE folders ADD COLUMN scripts TEXT`)
  },
}

export default migration
