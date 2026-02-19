/** Application-wide constants */

export const HTTP_METHODS = [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'
] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export const BODY_TYPES = [
  'none', 'json', 'xml', 'form-data', 'urlencoded', 'raw', 'graphql'
] as const

export type BodyType = (typeof BODY_TYPES)[number]

export const AUTH_TYPES = [
  'none', 'bearer', 'basic', 'api-key'
] as const

export type AuthType = (typeof AUTH_TYPES)[number]

/** Headers that may contain sensitive data */
export const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'proxy-authorization',
  'cookie',
  'set-cookie',
] as const

/** Query param keys that may contain sensitive data */
export const SENSITIVE_PARAM_KEYS = [
  'api_key',
  'apikey',
  'api-key',
  'access_token',
  'token',
  'secret',
  'password',
  'passwd',
  'auth',
] as const

/** Default settings */
export const DEFAULTS = {
  REQUEST_TIMEOUT_MS: 30000,
  HISTORY_RETENTION_DAYS: 30,
  FOLLOW_REDIRECTS: true,
  VERIFY_SSL: true,
  MAX_SCRIPT_CHAIN_DEPTH: 3,
  MAX_VARIABLE_NESTING: 10,
  SESSION_LOG_MAX_ENTRIES: 100,
} as const
