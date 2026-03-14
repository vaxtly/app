import { describe, it, expect, beforeEach } from 'vitest'
import { captureCookies, getCookieHeader, listAll, clearAll, deleteCookie } from '../../src/main/services/cookie-jar'
import type { ResponseCookie } from '../../src/shared/types/http'

beforeEach(() => {
  clearAll()
})

function makeCookie(overrides: Partial<ResponseCookie> = {}): ResponseCookie {
  return {
    name: 'session',
    value: 'abc123',
    ...overrides,
  }
}

describe('captureCookies', () => {
  it('stores a simple cookie', () => {
    captureCookies('https://example.com/api', [makeCookie()])
    const cookies = listAll()
    expect(cookies).toHaveLength(1)
    expect(cookies[0].name).toBe('session')
    expect(cookies[0].value).toBe('abc123')
    expect(cookies[0].domain).toBe('example.com')
  })

  it('stores cookie with explicit domain', () => {
    captureCookies('https://api.example.com/v1', [makeCookie({ domain: '.example.com' })])
    const cookies = listAll()
    expect(cookies[0].domain).toBe('.example.com')
  })

  it('prepends dot to domain if missing', () => {
    captureCookies('https://api.example.com/v1', [makeCookie({ domain: 'example.com' })])
    const cookies = listAll()
    expect(cookies[0].domain).toBe('.example.com')
  })

  it('captures path from cookie', () => {
    captureCookies('https://example.com/', [makeCookie({ path: '/api' })])
    expect(listAll()[0].path).toBe('/api')
  })

  it('defaults path to /', () => {
    captureCookies('https://example.com/', [makeCookie()])
    expect(listAll()[0].path).toBe('/')
  })

  it('captures secure and httpOnly flags', () => {
    captureCookies('https://example.com/', [makeCookie({ secure: true, httpOnly: true })])
    const c = listAll()[0]
    expect(c.secure).toBe(true)
    expect(c.httpOnly).toBe(true)
  })

  it('overwrites existing cookie with same name and domain', () => {
    captureCookies('https://example.com/', [makeCookie({ value: 'first' })])
    captureCookies('https://example.com/', [makeCookie({ value: 'second' })])
    const cookies = listAll()
    expect(cookies).toHaveLength(1)
    expect(cookies[0].value).toBe('second')
  })

  it('removes expired cookies', () => {
    const pastDate = new Date(Date.now() - 86400000).toUTCString()
    captureCookies('https://example.com/', [makeCookie({ expires: pastDate })])
    expect(listAll()).toHaveLength(0)
  })

  it('ignores cookies with empty names', () => {
    captureCookies('https://example.com/', [makeCookie({ name: '' })])
    expect(listAll()).toHaveLength(0)
  })
})

describe('getCookieHeader', () => {
  it('returns matching cookies for exact host (no Domain attribute)', () => {
    captureCookies('https://example.com/', [makeCookie()])
    expect(getCookieHeader('https://example.com/page')).toBe('session=abc123')
  })

  it('returns undefined for non-matching host (exact match)', () => {
    captureCookies('https://example.com/', [makeCookie()])
    expect(getCookieHeader('https://other.com/')).toBeUndefined()
  })

  it('does NOT send exact-host cookie to subdomain', () => {
    captureCookies('https://example.com/', [makeCookie()])
    expect(getCookieHeader('https://sub.example.com/')).toBeUndefined()
  })

  it('sends domain cookie to subdomains', () => {
    captureCookies('https://api.example.com/', [makeCookie({ domain: '.example.com' })])
    expect(getCookieHeader('https://other.example.com/')).toBe('session=abc123')
  })

  it('sends domain cookie to matching host', () => {
    captureCookies('https://api.example.com/', [makeCookie({ domain: '.example.com' })])
    expect(getCookieHeader('https://example.com/')).toBe('session=abc123')
  })

  it('respects path matching', () => {
    captureCookies('https://example.com/', [makeCookie({ path: '/api' })])
    expect(getCookieHeader('https://example.com/api/users')).toBe('session=abc123')
    expect(getCookieHeader('https://example.com/other')).toBeUndefined()
  })

  it('does not match partial path prefix', () => {
    captureCookies('https://example.com/', [makeCookie({ path: '/api' })])
    // /apikeys should NOT match /api
    expect(getCookieHeader('https://example.com/apikeys')).toBeUndefined()
  })

  it('respects secure flag', () => {
    captureCookies('https://example.com/', [makeCookie({ secure: true })])
    expect(getCookieHeader('https://example.com/')).toBe('session=abc123')
    expect(getCookieHeader('http://example.com/')).toBeUndefined()
  })

  it('returns multiple cookies', () => {
    captureCookies('https://example.com/', [
      makeCookie({ name: 'a', value: '1' }),
      makeCookie({ name: 'b', value: '2' }),
    ])
    const header = getCookieHeader('https://example.com/')
    expect(header).toContain('a=1')
    expect(header).toContain('b=2')
  })

  it('sorts by longest path first', () => {
    captureCookies('https://example.com/', [
      makeCookie({ name: 'root', value: 'r', path: '/' }),
    ])
    captureCookies('https://example.com/', [
      makeCookie({ name: 'api', value: 'a', path: '/api' }),
    ])
    const header = getCookieHeader('https://example.com/api/test')
    expect(header).toBe('api=a; root=r')
  })

  it('includes non-expired cookies', () => {
    captureCookies('https://example.com/', [
      makeCookie({
        name: 'valid',
        value: 'ok',
        expires: new Date(Date.now() + 60_000).toUTCString(), // 1 minute from now
      }),
    ])
    expect(getCookieHeader('https://example.com/')).toBe('valid=ok')
  })

  it('returns undefined for invalid URL', () => {
    expect(getCookieHeader('not a url')).toBeUndefined()
  })
})

describe('clearAll', () => {
  it('removes all cookies', () => {
    captureCookies('https://example.com/', [makeCookie()])
    captureCookies('https://other.com/', [makeCookie({ name: 'other' })])
    expect(listAll()).toHaveLength(2)
    clearAll()
    expect(listAll()).toHaveLength(0)
  })
})

describe('deleteCookie', () => {
  it('removes a specific cookie', () => {
    captureCookies('https://example.com/', [
      makeCookie({ name: 'a', value: '1' }),
      makeCookie({ name: 'b', value: '2' }),
    ])
    deleteCookie('example.com', 'a')
    const cookies = listAll()
    expect(cookies).toHaveLength(1)
    expect(cookies[0].name).toBe('b')
  })

  it('handles non-existent cookie gracefully', () => {
    deleteCookie('example.com', 'nonexistent')
    expect(listAll()).toHaveLength(0)
  })
})
