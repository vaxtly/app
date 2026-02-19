<script lang="ts">
  import CodeEditor from '../CodeEditor.svelte'
  import KeyValueEditor from '../shared/KeyValueEditor.svelte'
  import Checkbox from '../shared/Checkbox.svelte'
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

  let formatFeedback = $state('')

  function formatJson(): void {
    try {
      const formatted = JSON.stringify(JSON.parse(body), null, 2)
      onbodychange(formatted)
      formatFeedback = 'Formatted'
      setTimeout(() => formatFeedback = '', 1500)
    } catch {
      formatFeedback = 'Invalid JSON'
      setTimeout(() => formatFeedback = '', 2000)
    }
  }

  function formatXml(): void {
    // Simple XML indentation: split on >< boundaries and re-indent
    try {
      let depth = 0
      const lines = body
        .replace(/>\s*</g, '>\n<')
        .split('\n')
        .filter((l) => l.trim())

      const formatted = lines
        .map((line) => {
          const trimmed = line.trim()
          // Closing tag or self-closing: decrease before indent
          if (trimmed.startsWith('</')) depth = Math.max(0, depth - 1)
          const indented = '  '.repeat(depth) + trimmed
          // Opening tag (not self-closing, not closing): increase after indent
          if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.startsWith('<?') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
            depth++
          }
          return indented
        })
        .join('\n')

      onbodychange(formatted)
      formatFeedback = 'Formatted'
      setTimeout(() => formatFeedback = '', 1500)
    } catch {
      formatFeedback = 'Format error'
      setTimeout(() => formatFeedback = '', 2000)
    }
  }

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

<div class="be-root">
  <!-- Type selector -->
  <div class="be-types">
    {#each BODY_TYPES as type}
      <button
        onclick={() => onbodytypechange(type)}
        class="be-type"
        class:be-type--active={bodyType === type}
      >
        {typeLabels[type]}
      </button>
    {/each}

    {#if bodyType === 'json' || bodyType === 'xml'}
      <span class="be-types-spacer"></span>
      <button onclick={bodyType === 'json' ? formatJson : formatXml} class="be-format" title="Pretty print">
        {#if formatFeedback}
          <span class="be-format-feedback" class:be-format-feedback--err={formatFeedback !== 'Formatted'}>
            {formatFeedback}
          </span>
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h6M4 12h16M4 17h10"/>
          </svg>
          Format
        {/if}
      </button>
    {/if}
  </div>

  <!-- Body content -->
  <div class="be-content">
    {#if bodyType === 'none'}
      <div class="be-empty">
        <p>This request does not have a body.</p>
      </div>
    {:else if bodyType === 'json'}
      <div class="be-editor">
        <CodeEditor value={body} language="json" placeholder={'{"key": "value"}'} onchange={onbodychange} />
      </div>
    {:else if bodyType === 'xml'}
      <div class="be-editor">
        <CodeEditor value={body} language="xml" placeholder="<root></root>" onchange={onbodychange} />
      </div>
    {:else if bodyType === 'raw'}
      <div class="be-editor">
        <CodeEditor value={body} language="text" placeholder="Raw body..." onchange={onbodychange} />
      </div>
    {:else if bodyType === 'graphql'}
      <div class="be-graphql">
        <div class="be-graphql-query">
          <div class="be-section-label">Query</div>
          <div class="be-graphql-editor">
            <CodeEditor value={body} language="text" placeholder={"query { ... }"} onchange={onbodychange} />
          </div>
        </div>
        <div class="be-graphql-vars">
          <div class="be-section-label">Variables</div>
          <div class="be-graphql-editor">
            <CodeEditor value={graphqlVariables} language="json" placeholder={'{"key": "value"}'} onchange={ongraphqlvarschange ?? (() => {})} />
          </div>
        </div>
      </div>
    {:else if bodyType === 'urlencoded'}
      <div class="be-kv">
        <KeyValueEditor entries={urlencodedEntries} onchange={handleUrlencodedChange} />
      </div>
    {:else if bodyType === 'form-data'}
      <div class="be-formdata">
        {#each formData as entry, i}
          <div class="fd-row">
            <Checkbox checked={entry.enabled} onchange={(v) => updateFormEntry(i, 'enabled', v)} />
            <input
              type="text"
              value={entry.key}
              oninput={(e) => updateFormEntry(i, 'key', e.currentTarget.value)}
              placeholder="Key"
              class="fd-input fd-input--key"
            />
            <select
              value={entry.type}
              onchange={(e) => updateFormEntry(i, 'type', e.currentTarget.value)}
              class="fd-type"
            >
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
            {#if entry.type === 'file'}
              <button onclick={() => pickFile(i)} class="fd-file">
                {#if entry.value}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
                  </svg>
                  {entry.value}
                {:else}
                  Choose file...
                {/if}
              </button>
            {:else}
              <input
                type="text"
                value={entry.value}
                oninput={(e) => updateFormEntry(i, 'value', e.currentTarget.value)}
                placeholder="Value"
                class="fd-input fd-input--value"
              />
            {/if}
            <button onclick={() => removeFormEntry(i)} aria-label="Remove field" class="fd-remove">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
        <button onclick={addFormEntry} class="fd-add">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 4v16m8-8H4" />
          </svg>
          Add field
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .be-root {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* --- Type selector --- */
  .be-types {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-surface-700);
  }

  .be-type {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }

  .be-type:hover {
    color: var(--color-surface-200);
    background: color-mix(in srgb, var(--color-surface-700) 40%, transparent);
  }

  .be-type--active {
    color: var(--color-brand-400);
    background: color-mix(in srgb, var(--color-brand-500) 12%, transparent);
    font-weight: 500;
  }

  .be-type--active:hover {
    color: var(--color-brand-400);
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
  }

  .be-types-spacer {
    flex: 1;
  }

  .be-format {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
    white-space: nowrap;
  }

  .be-format:hover {
    color: var(--color-surface-200);
    background: color-mix(in srgb, var(--color-surface-700) 40%, transparent);
  }

  .be-format-feedback {
    color: #4ade80;
    font-size: 11px;
  }

  .be-format-feedback--err {
    color: #fb923c;
  }

  /* --- Content areas --- */
  .be-content {
    flex: 1;
    overflow: auto;
  }

  .be-empty {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
  }

  .be-empty p {
    font-size: 12px;
    color: var(--color-surface-500);
  }

  .be-editor {
    height: 100%;
    padding: 8px;
  }

  .be-kv {
    padding: 12px;
  }

  /* --- GraphQL --- */
  .be-graphql {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .be-graphql-query {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--color-surface-700);
    padding: 8px;
  }

  .be-graphql-vars {
    height: 128px;
    display: flex;
    flex-direction: column;
    padding: 8px;
  }

  .be-graphql-editor {
    flex: 1;
    min-height: 0;
  }

  .be-section-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-surface-500);
    margin-bottom: 4px;
    flex-shrink: 0;
  }

  /* --- Form Data --- */
  .be-formdata {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .fd-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .fd-input {
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

  .fd-input:hover { background: var(--color-surface-800); }
  .fd-input:focus { border-color: var(--color-brand-500); background: var(--color-surface-800); }
  .fd-input::placeholder { color: var(--color-surface-600); }

  .fd-input--key { flex: 1; font-weight: 500; }
  .fd-input--value { flex: 1; }

  .fd-type {
    height: 30px;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: color-mix(in srgb, var(--color-surface-800) 60%, transparent);
    color: var(--color-surface-300);
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
    outline: none;
  }

  .fd-file {
    flex: 1;
    min-width: 0;
    height: 30px;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px dashed var(--color-surface-600);
    border-radius: 4px;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: border-color 0.12s;
  }

  .fd-file:hover { border-color: var(--color-brand-500); }

  .fd-remove {
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

  .fd-row:hover .fd-remove { opacity: 1; }
  .fd-remove:hover { color: #f87171; background: color-mix(in srgb, #f87171 8%, transparent); }

  .fd-add {
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

  .fd-add:hover { color: var(--color-brand-400); }
</style>
