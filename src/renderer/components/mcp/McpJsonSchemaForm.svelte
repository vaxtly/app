<script lang="ts">
  interface Props {
    schema: Record<string, unknown>
    value: Record<string, unknown>
    onchange: (value: Record<string, unknown>) => void
  }

  let { schema, value, onchange }: Props = $props()

  let useRawEditor = $state(false)
  let rawJson = $state('')

  // Sync rawJson when value prop changes externally
  $effect(() => {
    rawJson = JSON.stringify(value, null, 2)
  })

  let properties = $derived(
    (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  )
  let requiredFields = $derived(
    (schema.required ?? []) as string[]
  )
  let propertyNames = $derived(Object.keys(properties))

  // Switch to raw editor for complex schemas
  let isComplex = $derived(
    propertyNames.some((key) => {
      const prop = properties[key]
      return prop.type === 'object' || prop.type === 'array'
    })
  )

  function handleFieldChange(key: string, fieldValue: string | number | boolean): void {
    const updated = { ...value, [key]: fieldValue }
    onchange(updated)
  }

  function handleRawJsonChange(): void {
    try {
      const parsed = JSON.parse(rawJson)
      onchange(parsed)
    } catch {
      // Invalid JSON — ignore
    }
  }

  function getFieldType(prop: Record<string, unknown>): string {
    if (typeof prop.type === 'string') return prop.type
    if (Array.isArray(prop.type)) return prop.type[0]
    return 'string'
  }
</script>

{#if useRawEditor || isComplex}
  <!-- Raw JSON editor -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <span class="text-xs text-surface-500">Arguments (JSON)</span>
      {#if !isComplex}
        <button
          onclick={() => { useRawEditor = false }}
          class="text-[10px] text-brand-400 hover:text-brand-300"
        >
          Switch to form
        </button>
      {/if}
    </div>
    <textarea
      bind:value={rawJson}
      oninput={handleRawJsonChange}
      rows="8"
      class="rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-3 py-2 font-mono text-xs text-surface-200 focus:border-brand-500/50 focus:outline-none"
      placeholder={"{}"}
    ></textarea>
  </div>
{:else}
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="text-xs text-surface-500">Arguments</span>
      <button
        onclick={() => {
          rawJson = JSON.stringify(value, null, 2)
          useRawEditor = true
        }}
        class="text-[10px] text-brand-400 hover:text-brand-300"
      >
        Switch to JSON
      </button>
    </div>

    {#each propertyNames as key (key)}
      {@const prop = properties[key]}
      {@const fieldType = getFieldType(prop)}
      {@const isRequired = requiredFields.includes(key)}
      <label class="flex flex-col gap-1">
        <span class="text-xs text-surface-400">
          {key}
          {#if isRequired}<span class="text-red-400">*</span>{/if}
          {#if prop.description}
            <span class="ml-1 text-surface-600">{prop.description}</span>
          {/if}
        </span>

        {#if fieldType === 'boolean'}
          <span class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!value[key]}
              onchange={(e) => handleFieldChange(key, (e.target as HTMLInputElement).checked)}
              class="accent-brand-500"
            />
            <span class="text-xs text-surface-300">{value[key] ? 'true' : 'false'}</span>
          </span>
        {:else if fieldType === 'number' || fieldType === 'integer'}
          <input
            type="number"
            value={value[key] as number ?? ''}
            oninput={(e) => handleFieldChange(key, Number((e.target as HTMLInputElement).value))}
            class="h-7 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-2 font-mono text-xs text-surface-200 focus:border-brand-500/50 focus:outline-none"
          />
        {:else}
          <input
            type="text"
            value={value[key] as string ?? ''}
            oninput={(e) => handleFieldChange(key, (e.target as HTMLInputElement).value)}
            class="h-7 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-2 font-mono text-xs text-surface-200 focus:border-brand-500/50 focus:outline-none"
            placeholder={prop.default !== undefined ? String(prop.default) : ''}
          />
        {/if}
      </label>
    {/each}

    {#if propertyNames.length === 0}
      <p class="text-xs text-surface-500">No parameters required</p>
    {/if}
  </div>
{/if}
