import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import type { WsMessage } from '../../../shared/types/websocket'
import { WS_MESSAGE_LOG_MAX } from '../../../shared/constants'

export function create(data: {
  connection_id: string
  direction: 'sent' | 'received'
  data: string
}): WsMessage {
  const db = getDatabase()
  const id = uuid()
  const size = Buffer.byteLength(data.data, 'utf8')
  const timestamp = new Date().toISOString()

  db.prepare(`
    INSERT INTO websocket_messages (id, connection_id, direction, data, timestamp, size)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.connection_id, data.direction, data.data, timestamp, size)

  return { id, connection_id: data.connection_id, direction: data.direction, data: data.data, timestamp, size }
}

export function findByConnection(connectionId: string, limit?: number): WsMessage[] {
  const db = getDatabase()
  const max = limit ?? WS_MESSAGE_LOG_MAX
  return db.prepare(`
    SELECT * FROM websocket_messages
    WHERE connection_id = ?
    ORDER BY timestamp ASC
    LIMIT ?
  `).all(connectionId, max) as WsMessage[]
}

export function clearByConnection(connectionId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM websocket_messages WHERE connection_id = ?').run(connectionId)
}

export function trimToMax(connectionId: string): void {
  const db = getDatabase()
  db.prepare(`
    DELETE FROM websocket_messages
    WHERE connection_id = ? AND id NOT IN (
      SELECT id FROM websocket_messages
      WHERE connection_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    )
  `).run(connectionId, connectionId, WS_MESSAGE_LOG_MAX)
}
