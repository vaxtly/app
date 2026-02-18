<script lang="ts">
  import KeyValueEditor from '../shared/KeyValueEditor.svelte'
  import type { KeyValueEntry } from '../../lib/types'

  interface Props {
    params: KeyValueEntry[]
    url: string
    onparamschange: (params: KeyValueEntry[]) => void
    onurlchange: (url: string) => void
  }

  let { params, url, onparamschange, onurlchange }: Props = $props()

  // Sync: when params change, rebuild URL query string
  function handleParamsChange(newParams: KeyValueEntry[]): void {
    onparamschange(newParams)
    rebuildUrl(newParams)
  }

  function rebuildUrl(entries: KeyValueEntry[]): void {
    try {
      const urlObj = new URL(url || 'http://placeholder')
      urlObj.search = ''
      for (const entry of entries) {
        if (entry.enabled && entry.key.trim()) {
          urlObj.searchParams.append(entry.key, entry.value)
        }
      }
      // Only update if URL was valid
      if (url) {
        const base = url.split('?')[0]
        const qs = urlObj.search
        onurlchange(base + qs)
      }
    } catch {
      // URL might be partial/invalid — don't try to reconstruct
    }
  }
</script>

<div class="p-3">
  <KeyValueEditor
    entries={params}
    onchange={handleParamsChange}
    keyPlaceholder="Parameter"
    valuePlaceholder="Value"
    showDescription
  />
</div>
