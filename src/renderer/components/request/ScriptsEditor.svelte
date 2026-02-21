<script lang="ts">
  import { onMount } from 'svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import type { ScriptsConfig } from '../../lib/types'

  interface Props {
    scripts: ScriptsConfig
    collectionId?: string
    requestId: string
    onchange: (scripts: ScriptsConfig) => void
  }

  let { scripts, collectionId, requestId, onchange }: Props = $props()

  // Available requests in the same collection (exclude self)
  let availableRequests = $derived(
    collectionsStore.requests
      .filter((r) => r.collection_id === collectionId && r.id !== requestId)
      .map((r) => ({ id: r.id, name: r.name, method: r.method })),
  )

  let hasPreRequest = $derived(!!scripts.pre_request)
  let hasPostResponse = $derived(!!scripts.post_response && scripts.post_response.length > 0)

  // --- Searchable request picker state ---
  let pickerOpen = $state(false)
  let pickerSearch = $state('')
  let pickerButtonEl = $state<HTMLElement | null>(null)
  let pickerPanelEl = $state<HTMLElement | null>(null)
  let pickerSearchEl = $state<HTMLElement | null>(null)
  let pickerStyle = $state('')

  const selectedRequest = $derived(
    availableRequests.find((r) => r.id === scripts.pre_request?.request_id) ?? null
  )

  const filteredRequests = $derived.by(() => {
    if (!pickerSearch.trim()) return availableRequests
    const q = pickerSearch.trim().toLowerCase()
    return availableRequests.filter(
      (r) => r.name.toLowerCase().includes(q) || r.method.toLowerCase().includes(q)
    )
  })

  const methodColors: Record<string, string> = {
    GET: 'var(--color-method-get)',
    POST: 'var(--color-method-post)',
    PUT: 'var(--color-method-put)',
    PATCH: 'var(--color-method-patch)',
    DELETE: 'var(--color-method-delete)',
    HEAD: 'var(--color-method-head)',
    OPTIONS: 'var(--color-method-options)',
  }

  function togglePicker(): void {
    pickerOpen = !pickerOpen
    if (pickerOpen) {
      pickerSearch = ''
      if (pickerButtonEl) {
        const rect = pickerButtonEl.getBoundingClientRect()
        pickerStyle = `top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px;`
      }
    }
  }

  function selectRequest(id: string): void {
    updatePreRequestId(id)
    pickerOpen = false
  }

  $effect(() => {
    if (pickerOpen && pickerSearchEl) {
      pickerSearchEl.focus()
    }
  })

  onMount(() => {
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node
      if (
        pickerPanelEl && !pickerPanelEl.contains(target) &&
        pickerButtonEl && !pickerButtonEl.contains(target)
      ) {
        pickerOpen = false
      }
    }

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') pickerOpen = false
    }

    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleKey)
    }
  })

  // --- Pre-request actions ---

  function togglePreRequest(): void {
    if (hasPreRequest) {
      onchange({ ...scripts, pre_request: undefined })
    } else {
      onchange({ ...scripts, pre_request: { action: 'send_request', request_id: '' } })
    }
  }

  function updatePreRequestId(requestId: string): void {
    onchange({ ...scripts, pre_request: { action: 'send_request', request_id: requestId } })
  }

  // --- Post-response actions ---

  function addPostResponse(): void {
    const existing = scripts.post_response ?? []
    onchange({ ...scripts, post_response: [...existing, { action: 'set_variable', source: '', target: '' }] })
  }

  function updatePostResponse(index: number, field: 'source' | 'target', value: string): void {
    const updated = [...(scripts.post_response ?? [])]
    updated[index] = { ...updated[index], [field]: value }
    onchange({ ...scripts, post_response: updated })
  }

  function removePostResponse(index: number): void {
    const updated = (scripts.post_response ?? []).filter((_, i) => i !== index)
    onchange({ ...scripts, post_response: updated.length > 0 ? updated : undefined })
  }
</script>

<div class="se-root">
  <!-- Pre-request script -->
  <section class="se-section">
    <div class="se-section-header">
      <h3 class="se-section-title">Pre-request Script</h3>
      <button onclick={togglePreRequest} class="se-action" class:se-action--danger={hasPreRequest}>
        {hasPreRequest ? 'Remove' : '+ Add'}
      </button>
    </div>

    {#if hasPreRequest}
      <div class="se-card">
        <span class="se-card-hint">Send dependent request first</span>

        <!-- Searchable request picker -->
        <button
          bind:this={pickerButtonEl}
          onclick={togglePicker}
          class="se-picker-trigger"
          class:se-picker-trigger--open={pickerOpen}
        >
          {#if selectedRequest}
            <span class="se-picker-method" style="color: {methodColors[selectedRequest.method] ?? '#94a3b8'}">
              {selectedRequest.method}
            </span>
            <span class="se-picker-name">{selectedRequest.name}</span>
          {:else}
            <span class="se-picker-placeholder">Select a request...</span>
          {/if}
          <svg class="se-picker-chevron" class:se-picker-chevron--open={pickerOpen} width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        {#if pickerOpen}
          <div bind:this={pickerPanelEl} class="se-picker-panel" style={pickerStyle}>
            <!-- Search -->
            <div class="se-picker-search-wrap">
              <svg class="se-picker-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                bind:this={pickerSearchEl}
                type="text"
                placeholder={"Filter requests\u2026"}
                bind:value={pickerSearch}
                class="se-picker-search"
              />
            </div>

            <!-- List -->
            <div class="se-picker-list">
              {#each filteredRequests as req (req.id)}
                {@const isSelected = scripts.pre_request?.request_id === req.id}
                <button
                  onclick={() => selectRequest(req.id)}
                  class="se-picker-item"
                  class:se-picker-item--selected={isSelected}
                >
                  <span class="se-picker-item-indicator">
                    {#if isSelected}
                      <span class="se-picker-item-dot"></span>
                    {/if}
                  </span>
                  <span class="se-picker-item-method" style="color: {methodColors[req.method] ?? '#94a3b8'}">
                    {req.method}
                  </span>
                  <span class="se-picker-item-name">{req.name}</span>
                </button>
              {:else}
                <div class="se-picker-empty">
                  {pickerSearch.trim() ? 'No matches' : 'No requests available'}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if availableRequests.length === 0}
          <p class="se-card-note">No other requests in this collection.</p>
        {/if}
      </div>
    {:else}
      <p class="se-hint">
        Fire a dependent request before this one runs. Useful for fetching auth tokens.
      </p>
    {/if}
  </section>

  <!-- Post-response scripts -->
  <section class="se-section">
    <div class="se-section-header">
      <h3 class="se-section-title">Post-response Scripts</h3>
      <button onclick={addPostResponse} class="se-action">
        + Add
      </button>
    </div>

    {#if hasPostResponse}
      <div class="se-scripts">
        {#each scripts.post_response ?? [] as script, i}
          <div class="se-card se-card--row">
            <div class="se-card-fields">
              <div class="se-field">
                <span class="se-field-label">Source (e.g. body.data.token, header.X-Auth, status)</span>
                <input
                  type="text"
                  value={script.source}
                  oninput={(e) => updatePostResponse(i, 'source', e.currentTarget.value)}
                  placeholder="body.data.access_token"
                  class="se-input"
                />
              </div>
              <div class="se-field">
                <span class="se-field-label">Target variable name</span>
                <input
                  type="text"
                  value={script.target}
                  oninput={(e) => updatePostResponse(i, 'target', e.currentTarget.value)}
                  placeholder="auth_token"
                  class="se-input"
                />
              </div>
            </div>
            <button
              onclick={() => removePostResponse(i)}
              class="se-remove"
              title="Remove"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="se-hint">
        Extract values from the response and set them as collection variables.
      </p>
    {/if}
  </section>
</div>

<style>
  .se-root {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .se-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .se-section-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-surface-300);
    margin: 0;
  }

  .se-action {
    border: none;
    background: transparent;
    color: var(--color-brand-400);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    padding: 0;
    transition: color 0.12s;
  }

  .se-action:hover { color: var(--color-brand-300); }
  .se-action--danger { color: var(--color-danger-light); }
  .se-action--danger:hover { color: var(--color-danger-lighter); }

  .se-hint {
    font-size: 11px;
    color: var(--color-surface-500);
    margin: 0;
    line-height: 1.5;
  }

  /* --- Card --- */
  .se-card {
    padding: 10px;
    border-radius: 6px;
    border: 1px solid var(--color-surface-700);
    background: color-mix(in srgb, var(--color-surface-800) 50%, transparent);
  }

  .se-card--row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .se-card-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .se-card-hint {
    display: block;
    font-size: 11px;
    color: var(--color-surface-400);
    margin-bottom: 6px;
  }

  .se-card-note {
    font-size: 11px;
    color: var(--color-surface-500);
    margin: 4px 0 0;
  }

  .se-scripts {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* --- Fields --- */
  .se-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .se-field-label {
    font-size: 10px;
    color: var(--color-surface-500);
  }

  .se-input {
    height: 30px;
    width: 100%;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: var(--color-surface-800);
    color: var(--color-surface-200);
    font-size: 12px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.12s;
  }

  .se-input:focus {
    border-color: var(--color-brand-500);
  }

  .se-input::placeholder {
    color: var(--color-surface-600);
  }

  .se-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    margin-top: 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-surface-500);
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
  }

  .se-remove:hover {
    color: var(--color-danger-light);
    background: color-mix(in srgb, var(--color-danger-light) 8%, transparent);
  }

  /* --- Searchable request picker --- */
  .se-picker-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: var(--color-surface-800);
    color: var(--color-surface-200);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    text-align: left;
    transition: border-color 0.12s;
  }

  .se-picker-trigger:hover {
    border-color: var(--color-surface-600);
  }

  .se-picker-trigger--open {
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-brand-500) 15%, transparent);
  }

  .se-picker-method {
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }

  .se-picker-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .se-picker-placeholder {
    flex: 1;
    color: var(--color-surface-500);
  }

  .se-picker-chevron {
    flex-shrink: 0;
    color: var(--color-surface-500);
    transition: transform 0.15s ease;
  }

  .se-picker-chevron--open {
    transform: rotate(180deg);
  }

  /* --- Picker dropdown panel --- */
  .se-picker-panel {
    position: fixed;
    z-index: 100;
    background: var(--color-surface-800);
    border: 1px solid var(--color-surface-600);
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 1px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: se-picker-in 0.12s ease-out;
  }

  @keyframes se-picker-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .se-picker-search-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-surface-700);
  }

  .se-picker-search-icon {
    flex-shrink: 0;
    color: var(--color-surface-500);
  }

  .se-picker-search {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-surface-200);
    font-size: 12px;
    font-family: inherit;
  }

  .se-picker-search::placeholder {
    color: var(--color-surface-500);
  }

  .se-picker-list {
    max-height: 200px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .se-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--color-surface-300);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s, color 0.1s;
  }

  .se-picker-item:hover {
    background: color-mix(in srgb, var(--color-surface-600) 50%, transparent);
    color: var(--color-surface-100);
  }

  .se-picker-item--selected {
    color: var(--color-surface-100);
  }

  .se-picker-item-indicator {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .se-picker-item-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-brand-400);
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-brand-400) 50%, transparent);
  }

  .se-picker-item-method {
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    flex-shrink: 0;
    width: 48px;
  }

  .se-picker-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .se-picker-empty {
    padding: 12px 10px;
    text-align: center;
    font-size: 11px;
    color: var(--color-surface-500);
  }
</style>
