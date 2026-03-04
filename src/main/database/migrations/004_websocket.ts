/**
 * Add websocket_messages table for WebSocket message history.
 */

import type Database from 'better-sqlite3'
import type { MigrationFile } from './types'

const migration: MigrationFile = {
  version: 4,
  name: '004_websocket',

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS websocket_messages (
        id TEXT PRIMARY KEY NOT NULL,
        connection_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
        data TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        size INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (connection_id) REFERENCES requests(id) ON DELETE CASCADE
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_websocket_messages_connection_id
      ON websocket_messages(connection_id)
    `)
  },
}

export default migration
