/**
 * Shared TLS + proxy options helper — builds TLS connect options and proxy
 * dispatchers from app settings. Reads cert file paths and proxy config from
 * settings, loads file contents at request time, and returns options suitable
 * for both undici Agent/ProxyAgent and Node https.Agent.
 */

import { readFileSync, existsSync } from 'fs'
import { Agent, ProxyAgent } from 'undici'
import https from 'node:https'
import * as settingsRepo from '../database/repositories/settings'

export interface TlsConfig {
  ca?: Buffer
  cert?: Buffer
  key?: Buffer
  passphrase?: string
  rejectUnauthorized: boolean
}

interface ProxyConfig {
  url: string
  token?: string
  noProxy: string[]
}

/**
 * Read TLS settings and load certificate file contents.
 * CA cert is only loaded when verifySsl is true (pointless when skipping verification).
 * Client cert/key are loaded regardless (mTLS is client auth, separate concern).
 */
export function getTlsConfig(verifySsl: boolean): TlsConfig {
  const caPath = settingsRepo.getSetting('tls.ca_cert_path')
  const certPath = settingsRepo.getSetting('tls.client_cert_path')
  const keyPath = settingsRepo.getSetting('tls.client_key_path')
  const passphrase = settingsRepo.getSetting('tls.client_key_passphrase')

  const config: TlsConfig = {
    rejectUnauthorized: verifySsl,
  }

  if (caPath && verifySsl) {
    if (!existsSync(caPath)) {
      throw new Error(`CA certificate file not found: ${caPath}`)
    }
    config.ca = readFileSync(caPath)
  }

  if (certPath) {
    if (!existsSync(certPath)) {
      throw new Error(`Client certificate file not found: ${certPath}`)
    }
    config.cert = readFileSync(certPath)
  }

  if (keyPath) {
    if (!existsSync(keyPath)) {
      throw new Error(`Client key file not found: ${keyPath}`)
    }
    config.key = readFileSync(keyPath)
  }

  if (passphrase) {
    config.passphrase = passphrase
  }

  return config
}

/**
 * Read proxy settings. Returns null when no proxy is configured.
 */
export function getProxyConfig(): ProxyConfig | null {
  const url = settingsRepo.getSetting('proxy.url')
  if (!url) return null

  const username = settingsRepo.getSetting('proxy.username')
  const password = settingsRepo.getSetting('proxy.password')
  const noProxyRaw = settingsRepo.getSetting('proxy.no_proxy')

  const config: ProxyConfig = {
    url,
    noProxy: noProxyRaw
      ? noProxyRaw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
      : [],
  }

  if (username) {
    config.token = `Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}`
  }

  return config
}

/**
 * Check whether a target URL should bypass the proxy based on the no_proxy list.
 * Supports exact hostname matches and wildcard prefixes (e.g., `*.local`, `.corp.com`).
 */
export function shouldProxy(targetUrl: string, noProxy: string[]): boolean {
  if (noProxy.length === 0) return true
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase()
    for (const pattern of noProxy) {
      if (pattern === '*') return false
      // Leading dot means suffix match (e.g., ".corp.com" matches "api.corp.com")
      if (pattern.startsWith('.') && hostname.endsWith(pattern)) return false
      // Wildcard prefix (e.g., "*.local" matches "foo.local")
      if (pattern.startsWith('*.') && hostname.endsWith(pattern.slice(1))) return false
      // Exact match
      if (hostname === pattern) return false
    }
  } catch {
    // Invalid URL — don't bypass proxy
  }
  return true
}

function hasCustomTls(config: TlsConfig): boolean {
  return !config.rejectUnauthorized || !!config.ca || !!config.cert || !!config.key
}

function buildTlsConnectOptions(config: TlsConfig): Record<string, unknown> {
  return {
    rejectUnauthorized: config.rejectUnauthorized,
    ...(config.ca && { ca: config.ca }),
    ...(config.cert && { cert: config.cert }),
    ...(config.key && { key: config.key }),
    ...(config.passphrase && { passphrase: config.passphrase }),
  }
}

/**
 * Create an undici dispatcher with TLS + proxy options from settings.
 * Returns ProxyAgent when proxy is configured (and target isn't bypassed),
 * Agent when only custom TLS is needed, or undefined for default behavior.
 *
 * @param targetUrl - The request target URL, used for no_proxy matching.
 *   When omitted, always uses proxy if configured.
 */
export function createUndiciDispatcher(
  verifySsl: boolean,
  targetUrl?: string,
): Agent | ProxyAgent | undefined {
  const config = getTlsConfig(verifySsl)
  const proxy = getProxyConfig()
  const tlsOpts = buildTlsConnectOptions(config)
  const useProxy = proxy && (!targetUrl || shouldProxy(targetUrl, proxy.noProxy))

  if (useProxy) {
    return new ProxyAgent({
      uri: proxy.url,
      ...(proxy.token && { token: proxy.token }),
      requestTls: tlsOpts,
    })
  }

  if (!hasCustomTls(config)) return undefined

  return new Agent({ connect: tlsOpts })
}

/**
 * Create a Node https.Agent with TLS options from settings.
 * Returns undefined if no custom TLS config is needed.
 * Used by the WebSocket client (ws library uses Node's https.Agent).
 * Note: proxy support for WebSocket is a future enhancement.
 */
export function createHttpsAgent(verifySsl: boolean): https.Agent | undefined {
  const config = getTlsConfig(verifySsl)
  if (!hasCustomTls(config)) return undefined

  return new https.Agent(buildTlsConnectOptions(config))
}
