<script lang="ts">
  import Checkbox from './Checkbox.svelte'
  import VarInput from './VarInput.svelte'
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

<div class="flex flex-col">
  <!-- Header -->
  <div class="flex h-7 items-center gap-px border-b border-[var(--glass-border)] px-0.5">
    {#if !readonly}<span class="w-9 shrink-0"></span>{/if}
    <span class="kv-col min-w-0 flex-1 px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-surface-500" style="font-feature-settings: var(--font-feature-mono)">{keyPlaceholder}</span>
    <span class="kv-col min-w-0 flex-1 px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-surface-500" style="font-feature-settings: var(--font-feature-mono)">{valuePlaceholder}</span>
    {#if showDescription}<span class="kv-col min-w-0 flex-[0.7] px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-surface-500" style="font-feature-settings: var(--font-feature-mono)">Description</span>{/if}
    {#if !readonly}<span class="w-[30px] shrink-0"></span>{/if}
  </div>

  <!-- Rows -->
  {#each entries as entry, i}
    <div class="group flex items-center gap-px border-b border-[var(--border-subtle)] px-0.5 transition-colors duration-100 hover:bg-surface-700/20" class:kv-row--disabled={!entry.enabled}>
      {#if !readonly}
        <span class="flex w-9 shrink-0 items-center justify-center">
          <Checkbox checked={entry.enabled} onchange={(v) => update(i, 'enabled', v)} />
        </span>
      {/if}
      <span class="kv-cell--key flex min-w-0 flex-1 items-center">
        <VarInput
          value={entry.key}
          oninput={(value) => update(i, 'key', value)}
          placeholder={keyPlaceholder}
          {readonly}
          class="kv-input"
        />
      </span>
      <span class="flex min-w-0 flex-1 items-center">
        <VarInput
          value={entry.value}
          oninput={(value) => update(i, 'value', value)}
          placeholder={valuePlaceholder}
          {readonly}
          class="kv-input"
        />
      </span>
      {#if showDescription}
        <span class="flex min-w-0 flex-[0.7] items-center">
          <input
            type="text"
            value={entry.description ?? ''}
            oninput={(e) => update(i, 'description', e.currentTarget.value)}
            placeholder="Description"
            {readonly}
            class="kv-input kv-input--desc"
          />
        </span>
      {/if}
      {#if !readonly}
        <span class="flex w-[30px] shrink-0 items-center justify-center">
          <button
            onclick={() => remove(i)}
            aria-label="Remove row"
            class="kv-remove flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-surface-600 opacity-0 transition-[opacity,color,background] duration-100 group-hover:opacity-100 hover:bg-danger-light/[0.08] hover:text-danger-light"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      {/if}
    </div>
  {/each}

  {#if !readonly}
    <button onclick={add} class="ml-9 flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-2 py-1.5 font-sans text-[11px] text-surface-500 transition-colors duration-100 hover:text-brand-400">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 4v16m8-8H4" />
      </svg>
      Add row
    </button>
  {/if}
</div>

<style>
  .kv-row--disabled :global(.kv-input) {
    opacity: 0.35;
  }

  :global(.kv-input) {
    width: 100%;
    height: 32px;
    line-height: 32px;
    min-width: 0;
    padding: 0 8px;
    border: none;
    border-left: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--color-surface-100);
    font-size: 12px;
    font-family: inherit;
    outline: none;
    transition: background 0.12s;
  }

  .kv-cell--key :global(.kv-input) {
    font-weight: 500;
    border-left: none;
  }

  :global(.kv-input:focus) {
    background: color-mix(in srgb, var(--color-brand-500) 5%, transparent);
  }

  :global(.kv-input--desc) {
    color: var(--color-surface-400);
    font-size: 11px;
  }
</style>
