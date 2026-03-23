import type { EnvironmentVariable } from '../../shared/types/models'

/**
 * Parse .env file content into EnvironmentVariable[].
 *
 * Supports:
 * - KEY=VALUE
 * - KEY="value with spaces"
 * - KEY='value with spaces'
 * - # comments and inline comments (unquoted only)
 * - Empty lines
 * - export KEY=VALUE (optional export prefix)
 * - Multiline values in double quotes (\n escape sequences)
 */
export function parseDotenv(content: string): EnvironmentVariable[] {
  const variables: EnvironmentVariable[] = []
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue

    // Strip optional 'export ' prefix
    const stripped = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed

    // Match KEY=VALUE (key must be word chars, dots, or hyphens)
    const eqIndex = stripped.indexOf('=')
    if (eqIndex === -1) continue

    const key = stripped.slice(0, eqIndex).trim()
    if (!key) continue

    let value = stripped.slice(eqIndex + 1)

    // Handle quoted values
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
      // Process escape sequences in double-quoted values
      if (stripped[eqIndex + 1] === '"') {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      }
    } else {
      // Strip inline comments for unquoted values (space + #)
      const commentIndex = value.indexOf(' #')
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex)
      }
      value = value.trim()
    }

    variables.push({ key, value, enabled: true })
  }

  return variables
}
