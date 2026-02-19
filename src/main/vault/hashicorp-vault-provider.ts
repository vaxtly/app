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
    const url = trimmed
      ? `${this.url}/v1/${this.mount}/metadata/${trimmed}`
      : `${this.url}/v1/${this.mount}/metadata`

    const response = await this.request('GET', `${url}?list=true`)

    if (response.status === 404) {
      logVault('list', basePath ?? '/', 'No secrets found')
      return []
    }

    if (!response.ok) {
      throw new Error(`Vault LIST failed: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    const keys: string[] = json?.data?.keys ?? []
    logVault('list', basePath ?? '/', `Listed ${keys.length} secret(s)`)
    return keys
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
    if (this.authMethod === 'token') {
      try {
        const response = await this.request('GET', `${this.url}/v1/auth/token/lookup-self`)
        return response.ok
      } catch {
        return false
      }
    }

    // For AppRole, test the login endpoint
    try {
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
        return response.ok
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      return false
    }
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

    if (this.namespace) {
      headers['X-Vault-Namespace'] = this.namespace
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
