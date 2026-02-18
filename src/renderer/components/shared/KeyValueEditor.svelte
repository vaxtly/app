<script lang="ts">
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

<div class="space-y-1.5">
  {#each entries as entry, i}
    <div class="group flex items-center gap-1.5">
      {#if !readonly}
        <input
          type="checkbox"
          checked={entry.enabled}
          onchange={(e) => update(i, 'enabled', e.currentTarget.checked)}
          class="h-3.5 w-3.5 shrink-0 rounded border-surface-600 bg-surface-800 accent-brand-500"
        />
      {/if}
      <input
        type="text"
        value={entry.key}
        oninput={(e) => update(i, 'key', e.currentTarget.value)}
        placeholder={keyPlaceholder}
        {readonly}
        class="h-7 min-w-0 flex-1 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none {!entry.enabled ? 'opacity-40' : ''}"
      />
      <input
        type="text"
        value={entry.value}
        oninput={(e) => update(i, 'value', e.currentTarget.value)}
        placeholder={valuePlaceholder}
        {readonly}
        class="h-7 min-w-0 flex-1 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none {!entry.enabled ? 'opacity-40' : ''}"
      />
      {#if showDescription}
        <input
          type="text"
          value={entry.description ?? ''}
          oninput={(e) => update(i, 'description', e.currentTarget.value)}
          placeholder="Description"
          {readonly}
          class="h-7 min-w-0 flex-[0.7] rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-400 placeholder-surface-600 focus:border-brand-500 focus:outline-none {!entry.enabled ? 'opacity-40' : ''}"
        />
      {/if}
      {#if !readonly}
        <button
          onclick={() => remove(i)}
          aria-label="Remove row"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-surface-600 opacity-0 transition-opacity hover:bg-surface-700 hover:text-red-400 group-hover:opacity-100"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  {/each}

  {#if !readonly}
    <button
      onclick={add}
      class="mt-1 flex items-center gap-1 text-xs text-surface-500 hover:text-brand-400"
    >
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 4v16m8-8H4" />
      </svg>
      Add row
    </button>
  {/if}
</div>
