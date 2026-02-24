<script lang="ts">
  import KeyValueEditor from '../shared/KeyValueEditor.svelte'
  import type { KeyValueEntry } from '../../lib/types'

  interface Props {
    headers: KeyValueEntry[]
    onchange: (headers: KeyValueEntry[]) => void
  }

  let { headers, onchange }: Props = $props()
</script>

<div class="flex h-full flex-col p-3">
  <KeyValueEditor
    entries={headers}
    {onchange}
    keyPlaceholder="Header name"
    valuePlaceholder="Value"
  />
</div>
