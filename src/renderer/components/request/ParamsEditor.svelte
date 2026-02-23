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
    if (!url) return
    const base = url.split('?')[0]
    const search = new URLSearchParams()
    for (const entry of entries) {
      if (entry.enabled && entry.key.trim()) {
        search.append(entry.key, entry.value)
      }
    }
    const qs = search.toString()
    onurlchange(qs ? `${base}?${qs}` : base)
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
