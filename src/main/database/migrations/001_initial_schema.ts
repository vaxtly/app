/**
 * Initial schema — mirrors the Laravel app's SQLite schema.
 * All primary keys are UUIDs stored as TEXT.
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 1,
  name: '001_initial_schema',

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        settings TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        variables TEXT,
        remote_sha TEXT,
        remote_synced_at TEXT,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        sync_enabled INTEGER NOT NULL DEFAULT 0,
        environment_ids TEXT,
        default_environment_id TEXT,
        file_shas TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_collections_workspace_id ON collections(workspace_id)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY NOT NULL,
        collection_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        environment_ids TEXT,
        default_environment_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_folders_collection_id ON folders(collection_id)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY NOT NULL,
        collection_id TEXT NOT NULL,
        folder_id TEXT,
        name TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        method TEXT NOT NULL DEFAULT 'GET',
        headers TEXT,
        query_params TEXT,
        body TEXT,
        body_type TEXT NOT NULL DEFAULT 'json',
        auth TEXT,
        scripts TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_requests_collection_id ON requests(collection_id)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_requests_folder_id ON requests(folder_id)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS environments (
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
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_environments_workspace_id ON environments(workspace_id)
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS window_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        x INTEGER,
        y INTEGER,
        width INTEGER NOT NULL DEFAULT 1200,
        height INTEGER NOT NULL DEFAULT 800,
        is_maximized INTEGER NOT NULL DEFAULT 0
      )
    `)
  },
}

export default migration
