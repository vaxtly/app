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

<div class="flex h-full flex-col gap-3 p-3">
  {#if implicitHeaders.length > 0}
    <div class="shrink-0">
      <div class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-surface-500">Auto-generated</div>
      <div class="flex flex-col gap-0.5">
        {#each implicitHeaders as header}
          <div class="flex items-center gap-1.5 rounded-sm bg-surface-800/40 px-2 py-1 font-mono text-[11px]" style="font-feature-settings: var(--font-feature-mono)">
            <span class="he-auto-key shrink-0 text-surface-400">{header.key}</span>
            <span class="min-w-0 truncate text-surface-500">{header.value}</span>
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

<style>
  .he-auto-key::after {
    content: ':';
  }
</style>
