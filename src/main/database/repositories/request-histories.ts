import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import type { RequestHistory } from '../../../shared/types/models'

export function create(data: {
  request_id: string
  method: string
  url: string
  status_code?: number
  request_headers?: string
  request_body?: string
  request_query_params?: string
  response_body?: string
  response_headers?: string
  duration_ms?: number
}): RequestHistory {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO request_histories (
      id, request_id, method, url, status_code,
      request_headers, request_body, request_query_params,
      response_body, response_headers, duration_ms,
      executed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.request_id,
    data.method,
    data.url,
    data.status_code ?? null,
    data.request_headers ?? null,
    data.request_body ?? null,
    data.request_query_params ?? null,
    data.response_body ?? null,
    data.response_headers ?? null,
    data.duration_ms ?? null,
    now,
    now,
    now
  )

  return findById(id)!
}

export function findById(id: string): RequestHistory | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM request_histories WHERE id = ?').get(id) as RequestHistory | undefined
}

export function findByRequest(requestId: string, limit = 50): RequestHistory[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM request_histories WHERE request_id = ? ORDER BY executed_at DESC LIMIT ?')
    .all(requestId, limit) as RequestHistory[]
}

export function remove(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM request_histories WHERE id = ?').run(id)
  return result.changes > 0
}

/**
 * Delete histories older than the given number of days.
 * Returns the count of deleted rows.
 */
export function prune(retentionDays: number): number {
  const db = getDatabase()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  const result = db
    .prepare("DELETE FROM request_histories WHERE executed_at < ?")
    .run(cutoff.toISOString())

  return result.changes
}
