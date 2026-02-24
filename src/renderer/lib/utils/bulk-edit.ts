import type { KeyValueEntry } from '../../../shared/types/models'
import type { FormDataEntry } from '../../../shared/types/http'

/**
 * Serialize key-value entries to bulk text format.
 * One entry per line: `key:value`. Disabled entries prefixed with `#`.
 * Entries where both key and value are empty are skipped.
 */
export function entriesToBulk(entries: KeyValueEntry[]): string {
  return entries
    .filter((e) => !e.generated && (e.key || e.value))
    .map((e) => {
      const line = `${e.key}:${e.value}`
      return e.enabled ? line : `#${line}`
    })
    .join('\n')
}

/**
 * Parse bulk text back into key-value entries.
 * Splits on first `:`. Lines starting with `#` are disabled.
 * Empty lines are skipped.
 */
export function bulkToEntries(text: string): KeyValueEntry[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      let enabled = true
      let raw = line

      if (raw.startsWith('#')) {
        enabled = false
        raw = raw.slice(1)
      }

      const colonIdx = raw.indexOf(':')
      if (colonIdx === -1) {
        return { key: raw, value: '', enabled }
      }

      return {
        key: raw.slice(0, colonIdx),
        value: raw.slice(colonIdx + 1),
        enabled,
      }
    })
}

/**
 * Serialize form-data entries to bulk text.
 * Text entries: `key:value` (disabled prefixed with `#`).
 * File entries: always shown as `#key:@filename (file)` — read-only markers.
 */
export function formDataToBulk(entries: FormDataEntry[]): string {
  return entries
    .filter((e) => e.key || e.value)
    .map((e) => {
      if (e.type === 'file') {
        return `#${e.key}:@${e.fileName ?? e.value} (file)`
      }
      const line = `${e.key}:${e.value}`
      return e.enabled ? line : `#${line}`
    })
    .join('\n')
}

/**
 * Parse bulk text back into form-data entries.
 * Text entries are parsed normally. File lines (`#key:@filename (file)`)
 * are matched back to the original array by key to preserve filePath/fileName.
 */
export function bulkToFormData(
  text: string,
  original: FormDataEntry[],
): FormDataEntry[] {
  const filesByKey = new Map<string, FormDataEntry[]>()
  for (const entry of original) {
    if (entry.type === 'file') {
      const list = filesByKey.get(entry.key) ?? []
      list.push(entry)
      filesByKey.set(entry.key, list)
    }
  }

  // Track which file entries have been consumed so duplicates resolve in order
  const consumed = new Map<string, number>()

  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      let enabled = true
      let raw = line

      if (raw.startsWith('#')) {
        enabled = false
        raw = raw.slice(1)
      }

      const colonIdx = raw.indexOf(':')
      if (colonIdx === -1) {
        return { key: raw, value: '', type: 'text' as const, enabled }
      }

      const key = raw.slice(0, colonIdx)
      const value = raw.slice(colonIdx + 1)

      // Detect file marker: @filename (file)
      if (value.startsWith('@') && value.endsWith(' (file)')) {
        const files = filesByKey.get(key)
        const idx = consumed.get(key) ?? 0
        if (files && idx < files.length) {
          consumed.set(key, idx + 1)
          return { ...files[idx], enabled: false }
        }
        // No matching original — preserve as disabled file stub
        const fileName = value.slice(1, -7) // strip `@` and ` (file)`
        return {
          key,
          value: fileName,
          type: 'file' as const,
          fileName,
          enabled: false,
        }
      }

      return { key, value, type: 'text' as const, enabled }
    })
}
