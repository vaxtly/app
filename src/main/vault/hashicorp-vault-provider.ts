/**
 * HashiCorp Vault KV v2 provider.
 * Supports token and AppRole authentication.
 * Namespace header is sent on all requests when configured (required for Vault Enterprise / HCP Vault).
 */

import type { SecretsProvider } from './secrets-provider.interface'
import { logVault } from '../services/session-log'
import { Agent, fetch as undiciFetch } from 'undici'

export class HashiCorpVaultProvider implements SecretsProvider {
  private token: string
  private readonly namespace: string | null
  private readonly dispatcher: Agent | undefined

  constructor(
    private readonly url: string,
    token: string,
    namespace: string | null,
    private readonly mount: string,
    private readonly authMethod: 'token' | 'approle' = 'token',
    private readonly roleId?: string,
    private readonly secretId?: string,
    verifySsl = true,
  ) {
    this.namespace = namespace
    // AppRole login is async — callers must use the static create() method
    this.token = token

    if (!verifySsl) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
    }
  }

  /**
   * Factory method that handles async AppRole login.
   */
  static async create(opts: {
    url: string
    token: string
    namespace: string | null
    mount: string
    authMethod: 'token' | 'approle'
    roleId?: string
    secretId?: string
    verifySsl?: boolean
  }): Promise<HashiCorpVaultProvider> {
    const provider = new HashiCorpVaultProvider(
      opts.url,
      opts.token,
      opts.namespace,
      opts.mount,
      opts.authMethod,
      opts.roleId,
      opts.secretId,
      opts.verifySsl ?? true,
    )

    if (opts.authMethod === 'approle') {
      provider.token = await provider.loginWithAppRole()
    }

    return provider
  }

  async listSecrets(basePath?: string): Promise<string[]> {
    const trimmed = basePath ? basePath.replace(/^\/|\/$/g, '') : null

    // Try KV v2 first (metadata/ prefix), then fall back to KV v1 (no prefix).
    // For each, try LIST method first, then GET ?list=true (for proxies that
    // reject non-standard HTTP methods).
    const attempts = [
      { label: 'KV v2 LIST', method: 'LIST', url: this.metadataUrl(trimmed) },
      { label: 'KV v2 GET',  method: 'GET',  url: `${this.metadataUrl(trimmed)}?list=true` },
      { label: 'KV v1 LIST', method: 'LIST', url: this.v1Url(trimmed) },
      { label: 'KV v1 GET',  method: 'GET',  url: `${this.v1Url(trimmed)}?list=true` },
    ]

    for (const attempt of attempts) {
      logVault('list', basePath ?? '/', `Trying ${attempt.label}: ${attempt.method} ${attempt.url}`)

      let response: Response
      try {
        response = await this.request(attempt.method, attempt.url)
      } catch (e) {
        logVault('list', basePath ?? '/', `${attempt.label} failed: ${e instanceof Error ? e.message : String(e)}`, false)
        continue
      }

      if (response.status === 404 || response.status === 405) {
        logVault('list', basePath ?? '/', `${attempt.label} → ${response.status}`, false)
        continue
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        logVault('list', basePath ?? '/', `${attempt.label} → ${response.status}: ${body}`, false)
        continue
      }

      const json = await response.json()
      const keys: string[] = json?.data?.keys ?? []
      logVault('list', basePath ?? '/', `${attempt.label} succeeded — ${keys.length} key(s): ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`)
      return keys
    }

    // All attempts failed
    logVault('list', basePath ?? '/', `All list attempts failed (mount="${this.mount}", url="${this.url}")`, false)
    return []
  }

  /** KV v2 metadata URL */
  private metadataUrl(path: string | null): string {
    return path
      ? `${this.url}/v1/${this.mount}/metadata/${path}`
      : `${this.url}/v1/${this.mount}/metadata/`
  }

  /** KV v1 URL (no metadata prefix) */
  private v1Url(path: string | null): string {
    return path
      ? `${this.url}/v1/${this.mount}/${path}`
      : `${this.url}/v1/${this.mount}/`
  }

  async getSecrets(path: string): Promise<Record<string, string> | null> {
    const response = await this.request('GET', `${this.url}/v1/${this.mount}/data/${path}`)

    if (response.status === 404) {
      logVault('get', path, 'Secret not found', false)
      return null
    }

    if (!response.ok) {
      throw new Error(`Vault GET failed: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    const data: Record<string, string> = json?.data?.data ?? {}
    logVault('get', path, `Retrieved ${Object.keys(data).length} key(s)`)
    return data
  }

  async putSecrets(path: string, data: Record<string, string>): Promise<void> {
    const response = await this.request('POST', `${this.url}/v1/${this.mount}/data/${path}`, {
      data,
    })

    if (!response.ok) {
      throw new Error(`Vault PUT failed: ${response.status} ${response.statusText}`)
    }

    logVault('put', path, `Saved ${Object.keys(data).length} key(s)`)
  }

  async deleteSecrets(path: string): Promise<void> {
    const response = await this.request(
      'DELETE',
      `${this.url}/v1/${this.mount}/metadata/${path}`,
    )

    if (response.status === 404) {
      return
    }

    if (!response.ok) {
      throw new Error(`Vault DELETE failed: ${response.status} ${response.statusText}`)
    }
  }

  async testConnection(): Promise<boolean> {
    let authOk: boolean

    if (this.authMethod === 'token') {
      const response = await this.request('GET', `${this.url}/v1/auth/token/lookup-self`)
      authOk = response.ok
    } else {
      // For AppRole, test the login endpoint
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (this.namespace) {
        headers['X-Vault-Namespace'] = this.namespace
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      try {
        const response = await this.fetch(`${this.url}/v1/auth/approle/login`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            role_id: this.roleId,
            secret_id: this.secretId,
          }),
          signal: controller.signal,
        })
        authOk = response.ok
      } finally {
        clearTimeout(timeout)
      }
    }

    if (!authOk) return false

    // Verify the mount exists by checking sys/mounts
    try {
      const mountsRes = await this.request('GET', `${this.url}/v1/sys/mounts`)
      if (mountsRes.ok) {
        const mountsJson = await mountsRes.json()
        const mounts = Object.keys(mountsJson?.data ?? mountsJson ?? {})
        const kvMounts = mounts.filter((m) => m !== 'request_headers' && m !== 'request_id' && m !== 'lease_id' && m !== 'renewable' && m !== 'lease_duration' && m !== 'wrap_info' && m !== 'warnings' && m !== 'auth')
        logVault('test', '/', `Available mounts: ${kvMounts.join(', ')}`)

        // Check if configured mount exists (Vault returns mount keys with trailing /)
        const mountKey = this.mount.endsWith('/') ? this.mount : `${this.mount}/`
        if (!mounts.includes(mountKey)) {
          logVault('test', '/', `WARNING: mount "${this.mount}" not found. Available: ${kvMounts.join(', ')}`, false)
        } else {
          logVault('test', '/', `Mount "${this.mount}" verified OK`)
        }
      }
    } catch {
      // sys/mounts may be forbidden by policy — not critical
      logVault('test', '/', 'Could not verify mounts (insufficient permissions)')
    }

    return true
  }

  private async loginWithAppRole(): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.namespace) {
      headers['X-Vault-Namespace'] = this.namespace
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    let response: Response
    try {
      response = await this.fetch(`${this.url}/v1/auth/approle/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role_id: this.roleId,
          secret_id: this.secretId,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      throw new Error(`AppRole login failed: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    if (!json?.auth?.client_token) {
      throw new Error('AppRole login response missing auth.client_token')
    }
    return json.auth.client_token
  }

  /**
   * Make an authenticated request. Namespace header is sent when configured
   * (required for Vault Enterprise / HCP Vault).
   *
   * For AppRole auth: if a request returns 403 (expired token), automatically
   * re-authenticates and retries the request once.
   */
  private async request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Response> {
    const response = await this.doRequest(method, url, body)

    // Auto-refresh: if AppRole and 403, re-login and retry once
    if (response.status === 403 && this.authMethod === 'approle' && this.roleId && this.secretId) {
      try {
        this.token = await this.loginWithAppRole()
        return await this.doRequest(method, url, body)
      } catch {
        // Re-login failed — return the original 403 response
        return response
      }
    }

    return response
  }

  private async doRequest(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'X-Vault-Token': this.token,
    }

    if (body) {
      headers['Content-Type'] = 'application/json'
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    try {
      const response = await this.fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      return response
    } finally {
      clearTimeout(timeout)
    }
  }

  /** Wrapper that uses undici's fetch with custom dispatcher when verifySsl is off. */
  private fetch(url: string, init: RequestInit): Promise<Response> {
    if (this.dispatcher) {
      return undiciFetch(url, { ...init, dispatcher: this.dispatcher }) as unknown as Promise<Response>
    }
    return fetch(url, init)
  }
}
