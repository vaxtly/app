/** HTTP method color classes */
export const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-orange-400',
  DELETE: 'text-red-400',
  HEAD: 'text-purple-400',
  OPTIONS: 'text-surface-400',
}

export const METHOD_BG_COLORS: Record<string, string> = {
  GET: 'bg-green-400/10 text-green-400',
  POST: 'bg-yellow-400/10 text-yellow-400',
  PUT: 'bg-blue-400/10 text-blue-400',
  PATCH: 'bg-orange-400/10 text-orange-400',
  DELETE: 'bg-red-400/10 text-red-400',
  HEAD: 'bg-purple-400/10 text-purple-400',
  OPTIONS: 'bg-surface-400/10 text-surface-400',
}

export function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-400'
  if (status >= 300 && status < 400) return 'text-yellow-400'
  if (status >= 400 && status < 500) return 'text-orange-400'
  if (status >= 500) return 'text-red-400'
  return 'text-surface-400'
}

export function getStatusBgColor(status: number): string {
  if (status >= 200 && status < 300) return 'bg-green-400/10 text-green-400'
  if (status >= 300 && status < 400) return 'bg-yellow-400/10 text-yellow-400'
  if (status >= 400 && status < 500) return 'bg-orange-400/10 text-orange-400'
  if (status >= 500) return 'bg-red-400/10 text-red-400'
  return 'bg-surface-400/10 text-surface-400'
}
