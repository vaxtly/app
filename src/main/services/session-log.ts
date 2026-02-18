/**
 * Session log service — in-memory ring buffer for operation logging.
 * Pushes entries to renderer via BrowserWindow.webContents.send.
 */

import { v4 as uuid } from 'uuid'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/types/ipc'
import type { SessionLogEntry } from '../../shared/types/sync'
import { DEFAULTS } from '../../shared/constants'

const logs: SessionLogEntry[] = []

export function addLog(
  category: SessionLogEntry['category'],
  type: string,
  target: string,
  message: string,
  success = true,
): void {
  const entry: SessionLogEntry = {
    id: uuid(),
    category,
    type,
    target,
    message,
    success,
    timestamp: new Date().toISOString(),
  }

  logs.unshift(entry)

  if (logs.length > DEFAULTS.SESSION_LOG_MAX_ENTRIES) {
    logs.length = DEFAULTS.SESSION_LOG_MAX_ENTRIES
  }

  // Push to all renderer windows
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.LOG_PUSH, entry)
  }
}

export function getLogs(): SessionLogEntry[] {
  return [...logs]
}

export function clearLogs(): void {
  logs.length = 0
}

// Convenience helpers
export function logSync(type: string, target: string, message: string, success = true): void {
  addLog('sync', type, target, message, success)
}

export function logVault(type: string, target: string, message: string, success = true): void {
  addLog('vault', type, target, message, success)
}

export function logHttp(type: string, target: string, message: string, success = true): void {
  addLog('http', type, target, message, success)
}

export function logSystem(type: string, target: string, message: string, success = true): void {
  addLog('system', type, target, message, success)
}
