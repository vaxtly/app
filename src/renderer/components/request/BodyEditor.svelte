<script lang="ts">
  import CodeEditor from '../CodeEditor.svelte'
  import KeyValueEditor from '../shared/KeyValueEditor.svelte'
  import type { KeyValueEntry, FormDataEntry } from '../../lib/types'
  import { BODY_TYPES } from '../../../shared/constants'

  interface Props {
    bodyType: string
    body: string
    formData: FormDataEntry[]
    graphqlVariables?: string
    onbodytypechange: (type: string) => void
    onbodychange: (body: string) => void
    onformdatachange: (data: FormDataEntry[]) => void
    ongraphqlvarschange?: (vars: string) => void
  }

  let {
    bodyType,
    body,
    formData,
    graphqlVariables = '',
    onbodytypechange,
    onbodychange,
    onformdatachange,
    ongraphqlvarschange,
  }: Props = $props()

  const typeLabels: Record<string, string> = {
    none: 'None',
    json: 'JSON',
    xml: 'XML',
    'form-data': 'Form Data',
    urlencoded: 'URL Encoded',
    raw: 'Raw',
    graphql: 'GraphQL',
  }

  function addFormEntry(): void {
    onformdatachange([...formData, { key: '', value: '', type: 'text', enabled: true }])
  }

  function removeFormEntry(index: number): void {
    onformdatachange(formData.filter((_, i) => i !== index))
  }

  function updateFormEntry(index: number, field: string, value: string | boolean): void {
    onformdatachange(
      formData.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    )
  }

  async function pickFile(index: number): Promise<void> {
    const result = await window.api.proxy.pickFile()
    if (result) {
      onformdatachange(
        formData.map((e, i) =>
          i === index ? { ...e, value: result.name, filePath: result.path, fileName: result.name } : e
        )
      )
    }
  }

  // Convert form data to URL-encoded key-value entries for the KeyValueEditor
  let urlencodedEntries = $derived.by(() => {
    if (bodyType !== 'urlencoded') return []
    try {
      const params = new URLSearchParams(body)
      const entries: KeyValueEntry[] = []
      params.forEach((value, key) => {
        entries.push({ key, value, enabled: true })
      })
      if (entries.length === 0) entries.push({ key: '', value: '', enabled: true })
      return entries
    } catch {
      return [{ key: '', value: '', enabled: true }]
    }
  })

  function handleUrlencodedChange(entries: KeyValueEntry[]): void {
    const params = new URLSearchParams()
    for (const e of entries) {
      if (e.enabled && e.key.trim()) {
        params.append(e.key, e.value)
      }
    }
    onbodychange(params.toString())
  }
</script>

<div class="flex h-full flex-col">
  <!-- Type selector -->
  <div class="flex shrink-0 items-center gap-2 border-b border-surface-700 px-3 py-2">
    {#each BODY_TYPES as type}
      <button
        onclick={() => onbodytypechange(type)}
        class="rounded px-2 py-0.5 text-xs transition-colors {bodyType === type ? 'bg-brand-500/15 text-brand-400 font-medium' : 'text-surface-400 hover:text-surface-200'}"
      >
        {typeLabels[type]}
      </button>
    {/each}
  </div>

  <!-- Body content -->
  <div class="flex-1 overflow-auto">
    {#if bodyType === 'none'}
      <div class="flex h-full items-center justify-center">
        <p class="text-xs text-surface-500">This request does not have a body.</p>
      </div>
    {:else if bodyType === 'json'}
      <div class="h-full p-2">
        <CodeEditor value={body} language="json" placeholder={'{"key": "value"}'} onchange={onbodychange} />
      </div>
    {:else if bodyType === 'xml'}
      <div class="h-full p-2">
        <CodeEditor value={body} language="xml" placeholder="<root></root>" onchange={onbodychange} />
      </div>
    {:else if bodyType === 'raw'}
      <div class="h-full p-2">
        <CodeEditor value={body} language="text" placeholder="Raw body..." onchange={onbodychange} />
      </div>
    {:else if bodyType === 'graphql'}
      <div class="flex h-full flex-col">
        <div class="flex-1 border-b border-surface-700 p-2">
          <div class="mb-1 text-[10px] font-medium uppercase text-surface-500">Query</div>
          <div class="h-[calc(100%-20px)]">
            <CodeEditor value={body} language="text" placeholder={"query { ... }"} onchange={onbodychange} />
          </div>
        </div>
        <div class="h-32 p-2">
          <div class="mb-1 text-[10px] font-medium uppercase text-surface-500">Variables</div>
          <div class="h-[calc(100%-20px)]">
            <CodeEditor value={graphqlVariables} language="json" placeholder={'{"key": "value"}'} onchange={ongraphqlvarschange ?? (() => {})} />
          </div>
        </div>
      </div>
    {:else if bodyType === 'urlencoded'}
      <div class="p-3">
        <KeyValueEditor entries={urlencodedEntries} onchange={handleUrlencodedChange} />
      </div>
    {:else if bodyType === 'form-data'}
      <div class="space-y-1.5 p-3">
        {#each formData as entry, i}
          <div class="group flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={entry.enabled}
              onchange={(e) => updateFormEntry(i, 'enabled', e.currentTarget.checked)}
              class="h-3.5 w-3.5 shrink-0 accent-brand-500"
            />
            <input
              type="text"
              value={entry.key}
              oninput={(e) => updateFormEntry(i, 'key', e.currentTarget.value)}
              placeholder="Key"
              class="h-7 min-w-0 flex-1 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            />
            <select
              value={entry.type}
              onchange={(e) => updateFormEntry(i, 'type', e.currentTarget.value)}
              class="h-7 cursor-pointer rounded border border-surface-700 bg-surface-800 px-1 text-[10px] text-surface-300"
            >
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
            {#if entry.type === 'file'}
              <button
                onclick={() => pickFile(i)}
                class="h-7 min-w-0 flex-1 truncate rounded border border-dashed border-surface-600 bg-surface-800/50 px-2 text-left text-xs text-surface-400 hover:border-brand-500"
              >
                {entry.value || 'Choose file...'}
              </button>
            {:else}
              <input
                type="text"
                value={entry.value}
                oninput={(e) => updateFormEntry(i, 'value', e.currentTarget.value)}
                placeholder="Value"
                class="h-7 min-w-0 flex-1 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
              />
            {/if}
            <button
              onclick={() => removeFormEntry(i)}
              aria-label="Remove field"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-surface-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
        <button onclick={addFormEntry} class="flex items-center gap-1 text-xs text-surface-500 hover:text-brand-400">
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 4v16m8-8H4" />
          </svg>
          Add field
        </button>
      </div>
    {/if}
  </div>
</div>
