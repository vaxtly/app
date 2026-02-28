/**
 * Add mcp_servers table for MCP server configurations per workspace.
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 2,
  name: '002_mcp_servers',

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        command TEXT,
        args TEXT,
        env TEXT,
        cwd TEXT,
        url TEXT,
        headers TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_workspace_id ON mcp_servers(workspace_id)
    `)
  },
}

export default migration
