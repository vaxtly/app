import { describe, it, expect } from 'vitest'
import { formatFetchError } from '../../src/main/services/fetch-error'

function makeFetchError(causeCode: string): Error {
  const cause = new Error('underlying') as Error & { code: string }
  cause.code = causeCode
  const err = new Error('fetch failed', { cause })
  return err
}

describe('formatFetchError', () => {
  it.each([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
  ])('returns SSL error message for %s', (code) => {
    const result = formatFetchError(makeFetchError(code))
    expect(result).toBe(`SSL certificate error (${code}). Disable "Verify SSL" in Settings to bypass.`)
  })

  it('returns ECONNREFUSED with URL when provided', () => {
    const result = formatFetchError(makeFetchError('ECONNREFUSED'), 'http://localhost:3000')
    expect(result).toBe('Connection refused — is the server running at http://localhost:3000?')
  })

  it('returns ECONNREFUSED without URL', () => {
    const result = formatFetchError(makeFetchError('ECONNREFUSED'))
    expect(result).toBe('Connection refused')
  })

  it('returns DNS error for ENOTFOUND', () => {
    expect(formatFetchError(makeFetchError('ENOTFOUND'))).toBe(
      'DNS lookup failed — could not resolve hostname',
    )
  })

  it('returns reset message for ECONNRESET', () => {
    expect(formatFetchError(makeFetchError('ECONNRESET'))).toBe('Connection reset by server')
  })

  it.each(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'])('returns timeout for %s', (code) => {
    expect(formatFetchError(makeFetchError(code))).toBe('Connection timed out')
  })

  it('falls back to cause.message for unknown fetch-failed codes', () => {
    const cause = new Error('some undici internal') as Error & { code: string }
    cause.code = 'UNKNOWN_CODE'
    const err = new Error('fetch failed', { cause })
    expect(formatFetchError(err)).toBe('some undici internal')
  })

  it('returns abort message when error contains "aborted"', () => {
    expect(formatFetchError(new Error('The operation was aborted'))).toBe(
      'Request aborted (timeout or cancelled)',
    )
  })

  it('returns "Request failed" for non-Error input', () => {
    expect(formatFetchError('string error')).toBe('Request failed')
    expect(formatFetchError(42)).toBe('Request failed')
    expect(formatFetchError(null)).toBe('Request failed')
  })
})
