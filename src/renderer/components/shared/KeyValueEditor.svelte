<script lang="ts">
  import Checkbox from './Checkbox.svelte'
  import type { KeyValueEntry } from '../../lib/types'

  interface Props {
    entries: KeyValueEntry[]
    onchange: (entries: KeyValueEntry[]) => void
    keyPlaceholder?: string
    valuePlaceholder?: string
    showDescription?: boolean
    readonly?: boolean
  }

  let {
    entries,
    onchange,
    keyPlaceholder = 'Key',
    valuePlaceholder = 'Value',
    showDescription = false,
    readonly = false,
  }: Props = $props()

  function add(): void {
    onchange([...entries, { key: '', value: '', enabled: true }])
  }

  function remove(index: number): void {
    onchange(entries.filter((_, i) => i !== index))
  }

  function update(index: number, field: keyof KeyValueEntry, value: string | boolean): void {
    const updated = entries.map((e, i) =>
      i === index ? { ...e, [field]: value } : e
    )
    onchange(updated)
  }
</script>

<div class="kv-editor">
  {#each entries as entry, i}
    <div class="kv-row" class:kv-row--disabled={!entry.enabled}>
      {#if !readonly}
        <Checkbox checked={entry.enabled} onchange={(v) => update(i, 'enabled', v)} />
      {/if}
      <input
        type="text"
        value={entry.key}
        oninput={(e) => update(i, 'key', e.currentTarget.value)}
        placeholder={keyPlaceholder}
        {readonly}
        class="kv-input kv-input--key"
      />
      <input
        type="text"
        value={entry.value}
        oninput={(e) => update(i, 'value', e.currentTarget.value)}
        placeholder={valuePlaceholder}
        {readonly}
        class="kv-input kv-input--value"
      />
      {#if showDescription}
        <input
          type="text"
          value={entry.description ?? ''}
          oninput={(e) => update(i, 'description', e.currentTarget.value)}
          placeholder="Description"
          {readonly}
          class="kv-input kv-input--desc"
        />
      {/if}
      {#if !readonly}
        <button
          onclick={() => remove(i)}
          aria-label="Remove row"
          class="kv-remove"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  {/each}

  {#if !readonly}
    <button onclick={add} class="kv-add">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 4v16m8-8H4" />
      </svg>
      Add row
    </button>
  {/if}
</div>

<style>
  .kv-editor {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .kv-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 1px 0;
  }

  .kv-row--disabled .kv-input {
    opacity: 0.35;
  }

  .kv-input {
    height: 30px;
    min-width: 0;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: color-mix(in srgb, var(--color-surface-800) 60%, transparent);
    color: var(--color-surface-100);
    font-size: 12px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.12s, background 0.12s;
  }

  .kv-input:hover {
    background: var(--color-surface-800);
  }

  .kv-input:focus {
    border-color: var(--color-brand-500);
    background: var(--color-surface-800);
  }

  .kv-input::placeholder {
    color: var(--color-surface-600);
  }

  .kv-input--key {
    flex: 1;
    font-weight: 500;
  }

  .kv-input--value {
    flex: 1;
  }

  .kv-input--desc {
    flex: 0.7;
    color: var(--color-surface-400);
    font-size: 11px;
  }

  .kv-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-surface-600);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s, color 0.1s, background 0.1s;
  }

  .kv-row:hover .kv-remove {
    opacity: 1;
  }

  .kv-remove:hover {
    color: #f87171;
    background: color-mix(in srgb, #f87171 8%, transparent);
  }

  .kv-add {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 2px;
    margin-top: 4px;
    border: none;
    background: transparent;
    color: var(--color-surface-500);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.12s;
  }

  .kv-add:hover {
    color: var(--color-brand-400);
  }
</style>
