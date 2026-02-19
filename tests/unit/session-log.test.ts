import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron's BrowserWindow before importing the module
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

// Import after mocking
import { addLog, getLogs, clearLogs, logSync, logVault, logHttp, logSystem } from '../../src/main/services/session-log'

beforeEach(() => {
  clearLogs()
})

describe('session-log', () => {
  it('addLog creates entry with correct fields', () => {
    addLog('http', 'request', 'https://api.com', 'GET 200 OK', true)
    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].id).toBeDefined()
    expect(logs[0].category).toBe('http')
    expect(logs[0].type).toBe('request')
    expect(logs[0].target).toBe('https://api.com')
    expect(logs[0].message).toBe('GET 200 OK')
    expect(logs[0].success).toBe(true)
    expect(logs[0].timestamp).toBeTruthy()
  })

  it('logs are in reverse chronological order', () => {
    addLog('http', 'a', '', 'first')
    addLog('http', 'b', '', 'second')
    addLog('http', 'c', '', 'third')
    const logs = getLogs()
    expect(logs[0].message).toBe('third')
    expect(logs[1].message).toBe('second')
    expect(logs[2].message).toBe('first')
  })

  it('clearLogs empties the buffer', () => {
    addLog('http', 'a', '', 'msg')
    expect(getLogs()).toHaveLength(1)
    clearLogs()
    expect(getLogs()).toHaveLength(0)
  })

  it('ring buffer caps at 100 entries', () => {
    for (let i = 0; i < 110; i++) {
      addLog('system', 'test', '', `entry-${i}`)
    }
    const logs = getLogs()
    expect(logs).toHaveLength(100)
    // Most recent should be entry-109
    expect(logs[0].message).toBe('entry-109')
  })

  it('getLogs returns a copy (mutation-safe)', () => {
    addLog('http', 'test', '', 'msg')
    const copy = getLogs()
    copy.push({ id: 'fake', category: 'http', type: '', target: '', message: '', success: true, timestamp: '' })
    expect(getLogs()).toHaveLength(1)
  })

  it('convenience helpers set correct category', () => {
    logSync('push', 'repo', 'Pushed')
    logVault('read', 'path', 'Read secret')
    logHttp('request', 'url', 'GET 200')
    logSystem('startup', 'app', 'Started')

    const logs = getLogs()
    expect(logs).toHaveLength(4)
    expect(logs.find((l) => l.category === 'sync')).toBeTruthy()
    expect(logs.find((l) => l.category === 'vault')).toBeTruthy()
    expect(logs.find((l) => l.category === 'http')).toBeTruthy()
    expect(logs.find((l) => l.category === 'system')).toBeTruthy()
  })
})
