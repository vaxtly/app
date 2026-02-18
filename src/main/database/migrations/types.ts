import type Database from 'better-sqlite3'

export interface MigrationFile {
  version: number
  name: string
  up: (db: Database.Database) => void
}
