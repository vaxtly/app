import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Must mock electron before any imports that use it
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  app: { getPath: () => '/tmp' },
  BrowserWindow: { getAllWindows: () => [] },
}))

// Mock undici
const { mockUndiciFetch } = vi.hoisted(() => ({ mockUndiciFetch: vi.fn() }))
vi.mock('undici', () => ({
  fetch: mockUndiciFetch,
  Agent: vi.fn(),
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  isTokenExpired,
  exchangeClientCredentials,
  exchangePassword,
  refreshAccessToken,
} from '../../src/main/services/oauth2'
import type { AuthConfig } from '../../src/shared/types/models'

beforeEach(() => {
  initEncryptionForTesting()
  openTestDatabase()
  mockUndiciFetch.mockReset()
})
afterEach(() => closeDatabase())

describe('PKCE', () => {
  it('generates a code verifier of correct length', () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('generates different verifiers each time', () => {
    const v1 = generateCodeVerifier()
    const v2 = generateCodeVerifier()
    expect(v1).not.toBe(v2)
  })

  it('generates a valid code challenge from verifier', () => {
    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge.length).toBeGreaterThan(0)
  })

  it('produces consistent challenge for same verifier', () => {
    const verifier = 'test-verifier-string'
    const c1 = generateCodeChallenge(verifier)
    const c2 = generateCodeChallenge(verifier)
    expect(c1).toBe(c2)
  })

  it('produces different challenges for different verifiers', () => {
    const c1 = generateCodeChallenge('verifier-1')
    const c2 = generateCodeChallenge('verifier-2')
    expect(c1).not.toBe(c2)
  })
})

describe('isTokenExpired', () => {
  it('returns false when no expires_at is set', () => {
    const auth: AuthConfig = { type: 'oauth2', oauth2_access_token: 'token' }
    expect(isTokenExpired(auth)).toBe(false)
  })

  it('returns false when token is not yet expired', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_access_token: 'token',
      oauth2_expires_at: Date.now() + 300_000,
    }
    expect(isTokenExpired(auth)).toBe(false)
  })

  it('returns true when token is expired', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_access_token: 'token',
      oauth2_expires_at: Date.now() - 60_000,
    }
    expect(isTokenExpired(auth)).toBe(true)
  })

  it('returns true within 30-second safety margin', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_access_token: 'token',
      oauth2_expires_at: Date.now() + 15_000,
    }
    expect(isTokenExpired(auth)).toBe(true)
  })

  it('returns false just outside the safety margin', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_access_token: 'token',
      oauth2_expires_at: Date.now() + 60_000,
    }
    expect(isTokenExpired(auth)).toBe(false)
  })
})

describe('token exchange (mocked HTTP)', () => {
  function mockTokenResponse(data: Record<string, unknown>, ok = true, status = 200): void {
    mockUndiciFetch.mockResolvedValue({
      ok,
      status,
      text: () => Promise.resolve(JSON.stringify(data)),
    })
  }

  it('exchangeClientCredentials sends correct params', async () => {
    mockTokenResponse({
      access_token: 'new-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    })

    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_grant_type: 'client_credentials',
      oauth2_access_token_url: 'https://auth.example.com/token',
      oauth2_client_id: 'my-client-id',
      oauth2_client_secret: 'my-secret',
      oauth2_scope: 'read write',
    }

    const result = await exchangeClientCredentials(auth)

    expect(result.oauth2_access_token).toBe('new-access-token')
    expect(result.oauth2_token_type).toBe('Bearer')
    expect(result.oauth2_expires_at).toBeGreaterThan(Date.now())

    expect(mockUndiciFetch).toHaveBeenCalledWith('https://auth.example.com/token', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    }))

    const body = mockUndiciFetch.mock.calls[0][1].body as string
    const params = new URLSearchParams(body)
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('client_id')).toBe('my-client-id')
    expect(params.get('client_secret')).toBe('my-secret')
    expect(params.get('scope')).toBe('read write')
  })

  it('exchangePassword sends correct params', async () => {
    mockTokenResponse({
      access_token: 'password-token',
      refresh_token: 'refresh-123',
      token_type: 'Bearer',
      expires_in: 7200,
    })

    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_grant_type: 'password',
      oauth2_access_token_url: 'https://auth.example.com/token',
      oauth2_client_id: 'my-client',
      oauth2_username: 'user',
      oauth2_password: 'pass',
    }

    const result = await exchangePassword(auth)

    expect(result.oauth2_access_token).toBe('password-token')
    expect(result.oauth2_refresh_token).toBe('refresh-123')

    const body = mockUndiciFetch.mock.calls[0][1].body as string
    const params = new URLSearchParams(body)
    expect(params.get('grant_type')).toBe('password')
    expect(params.get('username')).toBe('user')
    expect(params.get('password')).toBe('pass')
  })

  it('refreshAccessToken sends refresh_token', async () => {
    mockTokenResponse({
      access_token: 'refreshed-token',
      token_type: 'Bearer',
      expires_in: 3600,
    })

    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_access_token_url: 'https://auth.example.com/token',
      oauth2_client_id: 'my-client',
      oauth2_refresh_token: 'old-refresh-token',
    }

    const result = await refreshAccessToken(auth)

    expect(result.oauth2_access_token).toBe('refreshed-token')

    const body = mockUndiciFetch.mock.calls[0][1].body as string
    const params = new URLSearchParams(body)
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(params.get('refresh_token')).toBe('old-refresh-token')
  })

  it('throws when no refresh token is available', async () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_access_token_url: 'https://auth.example.com/token',
      oauth2_client_id: 'my-client',
    }

    await expect(refreshAccessToken(auth)).rejects.toThrow('No refresh token available')
  })

  it('throws on error response from token endpoint', async () => {
    mockTokenResponse({
      error: 'invalid_client',
      error_description: 'Client authentication failed',
    }, false, 401)

    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_grant_type: 'client_credentials',
      oauth2_access_token_url: 'https://auth.example.com/token',
      oauth2_client_id: 'bad-client',
    }

    await expect(exchangeClientCredentials(auth)).rejects.toThrow('Client authentication failed')
  })

  it('includes audience when provided', async () => {
    mockTokenResponse({ access_token: 'tok', token_type: 'Bearer' })

    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_grant_type: 'client_credentials',
      oauth2_access_token_url: 'https://auth.example.com/token',
      oauth2_client_id: 'id',
      oauth2_audience: 'https://api.example.com',
    }

    await exchangeClientCredentials(auth)

    const body = mockUndiciFetch.mock.calls[0][1].body as string
    const params = new URLSearchParams(body)
    expect(params.get('audience')).toBe('https://api.example.com')
  })

  it('handles response without expires_in', async () => {
    mockTokenResponse({ access_token: 'tok', token_type: 'Bearer' })

    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2_grant_type: 'client_credentials',
      oauth2_access_token_url: 'https://auth.example.com/token',
      oauth2_client_id: 'id',
    }

    const result = await exchangeClientCredentials(auth)
    expect(result.oauth2_access_token).toBe('tok')
    expect(result.oauth2_expires_at).toBeUndefined()
  })
})
