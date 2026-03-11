/**
 * Formats undici/fetch errors into human-readable messages.
 * Extracts the nested cause codes (SSL, DNS, connection, timeout).
 */
export function formatFetchError(error: unknown, url?: string): string {
  if (!(error instanceof Error)) return 'Request failed'
  const msg = error.message
  const cause = (error as any).cause

  if (msg === 'fetch failed' && cause) {
    const code = cause.code as string | undefined
    if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'CERT_HAS_EXPIRED' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      return `SSL certificate error (${code}). Disable "Verify SSL" in Settings to bypass, or add a custom CA certificate.`
    }
    if (code === 'ERR_OSSL_PEM_NO_START_LINE' || code === 'ERR_OSSL_PEM_BAD_BASE64_DECODE') {
      return 'Invalid certificate file format — ensure the file is in PEM format'
    }
    if (code === 'ECONNREFUSED') return url ? `Connection refused — is the server running at ${url}?` : 'Connection refused'
    if (code === 'ENOTFOUND') return 'DNS lookup failed — could not resolve hostname'
    if (code === 'ECONNRESET') return 'Connection reset by server'
    if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'Connection timed out'
    if (code === 'UND_ERR_PROXY_RESPONSE') return 'Proxy rejected the connection — check proxy URL and credentials'
    if (cause.message) return cause.message
  }

  if (msg.includes('aborted')) return 'Request aborted (timeout or cancelled)'
  if (msg.includes('407')) return 'Proxy authentication required — configure proxy credentials in Settings'
  return msg
}
