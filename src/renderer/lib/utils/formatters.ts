/** Formatting utilities */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function detectLanguage(headers: Record<string, string>): 'json' | 'html' | 'xml' | 'text' {
  const contentType = headers['content-type'] || ''
  if (contentType.includes('json')) return 'json'
  if (contentType.includes('html')) return 'html'
  if (contentType.includes('xml')) return 'xml'
  return 'text'
}

export function formatBody(body: string, lang: string): string {
  if (lang === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }
  return body
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}
