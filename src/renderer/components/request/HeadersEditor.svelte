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

<div class="he-root">
  {#if implicitHeaders.length > 0}
    <div class="he-auto">
      <div class="he-auto-label">Auto-generated</div>
      <div class="he-auto-list">
        {#each implicitHeaders as header}
          <div class="he-auto-row">
            <span class="he-auto-key">{header.key}</span>
            <span class="he-auto-value">{header.value}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="he-manual">
    <KeyValueEditor
      entries={headers}
      {onchange}
      keyPlaceholder="Header name"
      valuePlaceholder="Value"
    />
  </div>
</div>

<style>
  .he-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px;
    gap: 12px;
  }

  /* --- Auto-generated headers --- */
  .he-auto {
    flex-shrink: 0;
  }

  .he-auto-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-surface-500);
    margin-bottom: 6px;
  }

  .he-auto-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .he-auto-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--color-surface-800) 40%, transparent);
    font-size: 11px;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
  }

  .he-auto-key {
    color: var(--color-surface-400);
    flex-shrink: 0;
  }

  .he-auto-key::after {
    content: ':';
  }

  .he-auto-value {
    color: var(--color-surface-500);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* --- Manual headers --- */
  .he-manual {
    flex: 1;
  }
</style>
