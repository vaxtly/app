import { describe, it, expect } from 'vitest'
import { parseCookies, setDefaultHeader, deleteHeader } from '../../src/main/ipc/proxy'

describe('parseCookies', () => {
  function makeHeaders(setCookies: string[]): Headers {
    const h = new Headers()
    for (const c of setCookies) h.append('set-cookie', c)
    return h
  }

  it('parses a simple name=value cookie', () => {
    const cookies = parseCookies(makeHeaders(['session=abc123']))
    expect(cookies).toHaveLength(1)
    expect(cookies[0].name).toBe('session')
    expect(cookies[0].value).toBe('abc123')
  })

  it('parses cookie attributes (Domain/Path/HttpOnly/Secure/SameSite/Expires)', () => {
    const raw = 'id=xyz; Domain=example.com; Path=/api; HttpOnly; Secure; SameSite=Strict; Expires=Thu, 01 Jan 2099 00:00:00 GMT'
    const cookies = parseCookies(makeHeaders([raw]))
    expect(cookies).toHaveLength(1)
    expect(cookies[0].domain).toBe('example.com')
    expect(cookies[0].path).toBe('/api')
    expect(cookies[0].httpOnly).toBe(true)
    expect(cookies[0].secure).toBe(true)
    expect(cookies[0].sameSite).toBe('Strict')
    expect(cookies[0].expires).toBe('Thu, 01 Jan 2099 00:00:00 GMT')
  })

  it('parses multiple set-cookie headers', () => {
    const cookies = parseCookies(makeHeaders(['a=1', 'b=2; Path=/']))
    expect(cookies).toHaveLength(2)
    expect(cookies[0].name).toBe('a')
    expect(cookies[1].name).toBe('b')
    expect(cookies[1].path).toBe('/')
  })

  it('skips malformed entries without =', () => {
    const cookies = parseCookies(makeHeaders(['invalid-no-equals', 'ok=yes']))
    expect(cookies).toHaveLength(1)
    expect(cookies[0].name).toBe('ok')
  })

  it('handles value containing =', () => {
    const cookies = parseCookies(makeHeaders(['token=abc=def=ghi']))
    expect(cookies).toHaveLength(1)
    expect(cookies[0].name).toBe('token')
    expect(cookies[0].value).toBe('abc=def=ghi')
  })
})

describe('setDefaultHeader', () => {
  it('sets header when absent', () => {
    const headers: Record<string, string> = {}
    setDefaultHeader(headers, 'Content-Type', 'application/json')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('skips when header already present (case-insensitive)', () => {
    const headers: Record<string, string> = { 'content-type': 'text/plain' }
    setDefaultHeader(headers, 'Content-Type', 'application/json')
    expect(headers['content-type']).toBe('text/plain')
    expect(headers['Content-Type']).toBeUndefined()
  })
})

describe('deleteHeader', () => {
  it('removes header case-insensitively', () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: '*/*' }
    deleteHeader(headers, 'content-type')
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers['Accept']).toBe('*/*')
  })
})
