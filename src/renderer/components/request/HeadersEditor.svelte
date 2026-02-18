<script lang="ts">
  import KeyValueEditor from '../shared/KeyValueEditor.svelte'
  import type { KeyValueEntry } from '../../lib/types'

  interface Props {
    headers: KeyValueEntry[]
    implicitHeaders: { key: string; value: string }[]
    onchange: (headers: KeyValueEntry[]) => void
  }

  let { headers, implicitHeaders, onchange }: Props = $props()
</script>

<div class="flex h-full flex-col p-3">
  {#if implicitHeaders.length > 0}
    <div class="mb-3">
      <div class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-surface-500">Auto-generated</div>
      <div class="space-y-1">
        {#each implicitHeaders as header}
          <div class="flex items-center gap-1.5 rounded bg-surface-800/30 px-2 py-1">
            <span class="text-xs text-surface-400">{header.key}:</span>
            <span class="text-xs text-surface-500">{header.value}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="flex-1">
    <KeyValueEditor
      entries={headers}
      {onchange}
      keyPlaceholder="Header name"
      valuePlaceholder="Value"
    />
  </div>
</div>
