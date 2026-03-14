/**
 * Cookie Jar — in-memory cookie store.
 * Captures Set-Cookie headers from responses and injects Cookie headers on requests.
 * RFC 6265 compliant domain/path/secure matching.
 * In-memory only — cleared on app restart (cookies may contain session tokens).
 */

import type { StoredCookie } from '../../shared/types/cookies'
import type { ResponseCookie } from '../../shared/types/http'

// Map<domain, Map<name, StoredCookie>>
const store = new Map<string, Map<string, StoredCookie>>()

/**
 * Capture cookies from Set-Cookie response headers.
 */
export function captureCookies(
  responseUrl: string,
  cookies: ResponseCookie[],
): void {
  if (cookies.length === 0) return

  let requestHost: string
  try {
    requestHost = new URL(responseUrl).hostname
  } catch {
    return
  }

  const now = Date.now()

  for (const cookie of cookies) {
    if (!cookie.name) continue

    // Determine domain (RFC 6265 §5.3)
    // If no Domain attribute, exact host match only (stored with leading ".")
    // If Domain attribute present, prepend "." for subdomain matching
    let domain: string
    if (cookie.domain) {
      domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain
    } else {
      // Exact host — store with leading "." removed indicator
      domain = requestHost
    }

    const path = cookie.path || '/'
    const secure = cookie.secure ?? false
    const httpOnly = cookie.httpOnly ?? false
    const sameSite = cookie.sameSite

    // Determine expiry
    let expires: number | undefined
    if (cookie.expires) {
      // Max-Age takes precedence in Set-Cookie parsing, but our ResponseCookie
      // only has "expires" as a date string. Parse it.
      const parsed = Date.parse(cookie.expires)
      if (!isNaN(parsed)) {
        expires = parsed
        // If already expired, delete the cookie
        if (expires <= now) {
          deleteCookie(domain, cookie.name)
          continue
        }
      }
    }

    const stored: StoredCookie = {
      name: cookie.name,
      value: cookie.value,
      domain: domain.toLowerCase(),
      path,
      expires,
      httpOnly,
      secure,
      sameSite,
      createdAt: now,
    }

    const domainKey = stored.domain
    if (!store.has(domainKey)) {
      store.set(domainKey, new Map())
    }
    store.get(domainKey)!.set(cookie.name, stored)
  }
}

/**
 * Build the Cookie header value for a request URL.
 * Returns undefined if no cookies match.
 */
export function getCookieHeader(requestUrl: string): string | undefined {
  let host: string
  let path: string
  let isSecure: boolean
  try {
    const url = new URL(requestUrl)
    host = url.hostname.toLowerCase()
    path = url.pathname || '/'
    isSecure = url.protocol === 'https:'
  } catch {
    return undefined
  }

  const now = Date.now()
  const matched: StoredCookie[] = []

  for (const [domain, cookies] of store) {
    if (!domainMatches(domain, host)) continue

    for (const [name, cookie] of cookies) {
      // Check expiry
      if (cookie.expires && cookie.expires <= now) {
        cookies.delete(name)
        continue
      }

      // Check path
      if (!pathMatches(cookie.path, path)) continue

      // Check secure flag
      if (cookie.secure && !isSecure) continue

      matched.push(cookie)
    }

    // Clean up empty domain entries
    if (cookies.size === 0) {
      store.delete(domain)
    }
  }

  if (matched.length === 0) return undefined

  // Sort by longest path first (RFC 6265 §5.4)
  matched.sort((a, b) => b.path.length - a.path.length || a.createdAt - b.createdAt)

  return matched.map((c) => `${c.name}=${c.value}`).join('; ')
}

/**
 * List all cookies grouped by domain.
 */
export function listAll(): StoredCookie[] {
  const now = Date.now()
  const result: StoredCookie[] = []

  for (const [domain, cookies] of store) {
    for (const [name, cookie] of cookies) {
      if (cookie.expires && cookie.expires <= now) {
        cookies.delete(name)
        continue
      }
      result.push(cookie)
    }
    if (cookies.size === 0) {
      store.delete(domain)
    }
  }

  return result.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))
}

/**
 * Clear all cookies.
 */
export function clearAll(): void {
  store.clear()
}

/**
 * Delete a specific cookie by domain and name.
 */
export function deleteCookie(domain: string, name: string): void {
  const cookies = store.get(domain.toLowerCase())
  if (cookies) {
    cookies.delete(name)
    if (cookies.size === 0) {
      store.delete(domain.toLowerCase())
    }
  }
}

/**
 * RFC 6265 domain matching.
 * A cookie domain ".example.com" matches "example.com" and "sub.example.com".
 * An exact domain "example.com" matches only "example.com".
 */
function domainMatches(cookieDomain: string, requestHost: string): boolean {
  if (cookieDomain === requestHost) return true
  if (cookieDomain.startsWith('.')) {
    // ".example.com" matches "example.com" and "*.example.com"
    const suffix = cookieDomain.slice(1)
    return requestHost === suffix || requestHost.endsWith(cookieDomain)
  }
  return false
}

/**
 * RFC 6265 path matching.
 * Cookie path "/foo" matches "/foo", "/foo/bar", but not "/foobar".
 */
function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (requestPath === cookiePath) return true
  if (requestPath.startsWith(cookiePath)) {
    // Must be an exact prefix followed by "/" or end of path
    return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'
  }
  return false
}
