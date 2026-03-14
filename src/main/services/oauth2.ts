/**
 * OAuth 2.0 service — token exchange, PKCE, refresh, and authorization callback server.
 *
 * Supports: Authorization Code + PKCE, Client Credentials, Password grant.
 */

import { createHash, randomBytes } from 'crypto'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { shell } from 'electron'
import { fetch as undiciFetch } from 'undici'
import type { AuthConfig } from '../../shared/types/models'
import { logHttp } from './session-log'

export interface TokenResponse {
  oauth2_access_token: string
  oauth2_refresh_token?: string
  oauth2_token_type?: string
  oauth2_expires_at?: number
}

// --- PKCE ---

export function generateCodeVerifier(): string {
  // 43-128 characters from unreserved URI characters
  return randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// --- Token exchange ---

export async function exchangeAuthorizationCode(
  auth: AuthConfig,
  code: string,
  codeVerifier?: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: auth.oauth2_client_id ?? '',
    redirect_uri: auth.oauth2_redirect_url ?? '',
  })

  if (auth.oauth2_client_secret) {
    params.set('client_secret', auth.oauth2_client_secret)
  }

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier)
  }

  return fetchToken(auth.oauth2_access_token_url ?? '', params)
}

export async function exchangeClientCredentials(auth: AuthConfig): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.oauth2_client_id ?? '',
  })

  if (auth.oauth2_client_secret) {
    params.set('client_secret', auth.oauth2_client_secret)
  }

  if (auth.oauth2_scope) {
    params.set('scope', auth.oauth2_scope)
  }

  if (auth.oauth2_audience) {
    params.set('audience', auth.oauth2_audience)
  }

  return fetchToken(auth.oauth2_access_token_url ?? '', params)
}

export async function exchangePassword(auth: AuthConfig): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'password',
    username: auth.oauth2_username ?? '',
    password: auth.oauth2_password ?? '',
    client_id: auth.oauth2_client_id ?? '',
  })

  if (auth.oauth2_client_secret) {
    params.set('client_secret', auth.oauth2_client_secret)
  }

  if (auth.oauth2_scope) {
    params.set('scope', auth.oauth2_scope)
  }

  return fetchToken(auth.oauth2_access_token_url ?? '', params)
}

// Per-token-URL mutex to prevent concurrent refresh requests
const refreshLocks = new Map<string, Promise<TokenResponse>>()

export async function refreshAccessToken(auth: AuthConfig): Promise<TokenResponse> {
  if (!auth.oauth2_refresh_token) {
    throw new Error('No refresh token available')
  }

  const lockKey = `${auth.oauth2_access_token_url}:${auth.oauth2_client_id}`
  const existing = refreshLocks.get(lockKey)
  if (existing) return existing

  const refreshPromise = (async () => {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.oauth2_refresh_token!,
      client_id: auth.oauth2_client_id ?? '',
    })

    if (auth.oauth2_client_secret) {
      params.set('client_secret', auth.oauth2_client_secret)
    }

    return fetchToken(auth.oauth2_access_token_url ?? '', params)
  })()

  refreshLocks.set(lockKey, refreshPromise)
  try {
    return await refreshPromise
  } finally {
    refreshLocks.delete(lockKey)
  }
}

// --- Token expiry ---

export function isTokenExpired(auth: AuthConfig): boolean {
  if (!auth.oauth2_expires_at) return false
  // Consider expired 30 seconds before actual expiry for safety
  return Date.now() >= auth.oauth2_expires_at - 30_000
}

// --- Callback server ---

export interface CallbackServer {
  url: string
  port: number
  waitForCode: Promise<string>
  close: () => void
}

export function startCallbackServer(preferredPort?: number): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let codeResolve: (code: string) => void
    let codeReject: (error: Error) => void
    const waitForCode = new Promise<string>((res, rej) => {
      codeResolve = res
      codeReject = rej
    })

    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`)

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html' })
        if (error) {
          res.end('<html><body><h2>Authorization Failed</h2><p>You can close this tab.</p></body></html>')
          codeReject(new Error(`OAuth error: ${error} — ${url.searchParams.get('error_description') ?? ''}`))
        } else if (code) {
          res.end('<html><body><h2>Authorization Successful</h2><p>You can close this tab.</p></body></html>')
          codeResolve(code)
        } else {
          res.end('<html><body><h2>Missing Code</h2><p>No authorization code received.</p></body></html>')
          codeReject(new Error('No authorization code in callback'))
        }
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    // Auto-close after 5 minutes
    const timeout = setTimeout(() => {
      server.close()
      codeReject(new Error('Authorization timed out (5 minutes)'))
    }, 5 * 60 * 1000)

    const cleanup = (): void => {
      clearTimeout(timeout)
      server.close()
    }

    // Resolve code promise also triggers cleanup
    const wrappedWaitForCode = waitForCode.finally(cleanup)

    server.listen(preferredPort ?? 0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start callback server'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/callback`,
        port: addr.port,
        waitForCode: wrappedWaitForCode,
        close: cleanup,
      })
    })

    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

// --- Authorization flow ---

export async function startAuthorizationFlow(auth: AuthConfig): Promise<{ code: string; codeVerifier?: string }> {
  // If the user configured a redirect URL, extract the port so our server listens on it
  let preferredPort: number | undefined
  if (auth.oauth2_redirect_url) {
    try {
      const parsed = new URL(auth.oauth2_redirect_url)
      if (parsed.port) preferredPort = parseInt(parsed.port, 10)
    } catch { /* use ephemeral port */ }
  }

  const server = await startCallbackServer(preferredPort)
  const redirectUri = auth.oauth2_redirect_url || server.url

  let codeVerifier: string | undefined
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: auth.oauth2_client_id ?? '',
    redirect_uri: redirectUri,
    state: randomBytes(16).toString('hex'),
  })

  if (auth.oauth2_scope) {
    params.set('scope', auth.oauth2_scope)
  }

  if (auth.oauth2_audience) {
    params.set('audience', auth.oauth2_audience)
  }

  // PKCE (default on for auth code)
  if (auth.oauth2_pkce !== false) {
    codeVerifier = generateCodeVerifier()
    params.set('code_challenge', generateCodeChallenge(codeVerifier))
    params.set('code_challenge_method', 'S256')
  }

  const authUrl = `${auth.oauth2_authorization_url}?${params.toString()}`

  logHttp('oauth2', authUrl, 'Opening browser for authorization...')
  await shell.openExternal(authUrl)

  try {
    const code = await server.waitForCode
    return { code, codeVerifier }
  } catch (error) {
    server.close()
    throw error
  }
}

// --- Shared fetch ---

async function fetchToken(tokenUrl: string, params: URLSearchParams): Promise<TokenResponse> {
  if (!tokenUrl) {
    throw new Error('Token URL is required')
  }

  const response = await undiciFetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  })

  const text = await response.text()

  if (!response.ok) {
    let errorMessage = `Token request failed (${response.status})`
    try {
      const errorData = JSON.parse(text)
      if (errorData.error_description) errorMessage += `: ${errorData.error_description}`
      else if (errorData.error) errorMessage += `: ${errorData.error}`
    } catch {
      if (text) errorMessage += `: ${text.slice(0, 200)}`
    }
    throw new Error(errorMessage)
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    // Some providers (e.g. GitHub) may return form-encoded despite Accept header
    try {
      const parsed = new URLSearchParams(text)
      data = Object.fromEntries(parsed.entries())
    } catch {
      throw new Error('Invalid response from token endpoint')
    }
  }

  const accessToken = data.access_token as string | undefined
  if (!accessToken) {
    throw new Error('No access_token in response')
  }

  const result: TokenResponse = {
    oauth2_access_token: accessToken,
    oauth2_token_type: (data.token_type as string) ?? 'Bearer',
  }

  if (data.refresh_token) {
    result.oauth2_refresh_token = data.refresh_token as string
  }

  if (typeof data.expires_in === 'number') {
    result.oauth2_expires_at = Date.now() + data.expires_in * 1000
  }

  return result
}
