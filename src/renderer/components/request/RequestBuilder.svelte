<script lang="ts">
  import UrlBar from './UrlBar.svelte'
  import ParamsEditor from './ParamsEditor.svelte'
  import HeadersEditor from './HeadersEditor.svelte'
  import BodyEditor from './BodyEditor.svelte'
  import AuthEditor from './AuthEditor.svelte'
  import ScriptsEditor from './ScriptsEditor.svelte'
  import ResponseViewer from '../response/ResponseViewer.svelte'
  import CodeSnippetModal from '../modals/CodeSnippetModal.svelte'
  import { setContext } from 'svelte'
  import { appStore, type TabRequestState } from '../../lib/stores/app.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import type { KeyValueEntry, AuthConfig, ScriptsConfig, FormDataEntry, ResponseData } from '../../lib/types'
  import type { ResolvedVariable } from '../../lib/utils/variable-highlight'

  interface Props {
    tabId: string
    requestId: string
  }

  let { tabId, requestId }: Props = $props()

  // Request tab sub-tabs
  type RequestTab = 'params' | 'headers' | 'body' | 'auth' | 'scripts'
  let activeRequestTab = $state<RequestTab>('params')

  // Code snippet modal
  let showCodeSnippet = $state(false)

  // Get state from the tab state cache
  let state = $derived(appStore.getTabState(tabId))

  // Parsed fields
  const defaultKV: KeyValueEntry[] = [{ key: '', value: '', enabled: true }]

  let headers = $derived.by((): KeyValueEntry[] => {
    if (!state?.headers) return defaultKV
    try { const v = JSON.parse(state.headers); return Array.isArray(v) ? v : defaultKV } catch { return defaultKV }
  })

  let queryParams = $derived.by((): KeyValueEntry[] => {
    if (!state?.query_params) return defaultKV
    try { const v = JSON.parse(state.query_params); return Array.isArray(v) ? v : defaultKV } catch { return defaultKV }
  })

  let auth = $derived.by((): AuthConfig => {
    if (!state?.auth) return { type: 'none' }
    try { return JSON.parse(state.auth) } catch { return { type: 'none' } }
  })

  let scripts = $derived.by((): ScriptsConfig => {
    if (!state?.scripts) return {}
    try { return JSON.parse(state.scripts) } catch { return {} }
  })

  let currentCollectionId = $derived(collectionsStore.getRequestById(requestId)?.collection_id)

  // Resolved variables for highlighting (refreshed when env or collection changes)
  let resolvedVars = $state<Record<string, ResolvedVariable>>({})

  $effect(() => {
    // Track dependencies so we re-fetch when active env or collection changes
    void environmentsStore.activeEnvironmentId
    void currentCollectionId
    window.api.variables.resolveWithSource(
      appStore.activeWorkspaceId ?? undefined,
      currentCollectionId,
    ).then((result) => {
      resolvedVars = result as Record<string, ResolvedVariable>
    })
  })

  function getResolvedVariables(): Record<string, ResolvedVariable> {
    return resolvedVars
  }

  function refreshResolvedVars(): void {
    window.api.variables.resolveWithSource(
      appStore.activeWorkspaceId ?? undefined,
      currentCollectionId,
    ).then((result) => {
      resolvedVars = result as Record<string, ResolvedVariable>
    })
  }

  // Provide resolved vars via context for VarInput and CodeEditor children
  setContext('resolvedVars', getResolvedVariables)

  const defaultFormData: FormDataEntry[] = [{ key: '', value: '', type: 'text', enabled: true }]

  let formData = $derived.by((): FormDataEntry[] => {
    if (!state?.body_type || state.body_type !== 'form-data') return defaultFormData
    if (!state.body) return defaultFormData
    try {
      const v = JSON.parse(state.body)
      if (!Array.isArray(v)) return defaultFormData
      // Ensure every entry has type and enabled defaults (old data may lack them)
      return v.map((e: any) => ({ type: 'text' as const, enabled: true, ...e }))
    } catch { return defaultFormData }
  })

  // Compute implicit headers from body type and auth
  let implicitHeaders = $derived.by(() => {
    const result: { key: string; value: string }[] = []
    if (state?.body_type === 'json') result.push({ key: 'Content-Type', value: 'application/json' })
    else if (state?.body_type === 'xml') result.push({ key: 'Content-Type', value: 'application/xml' })
    else if (state?.body_type === 'urlencoded') result.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' })
    else if (state?.body_type === 'graphql') result.push({ key: 'Content-Type', value: 'application/json' })

    if (auth.type === 'bearer' && auth.bearer_token) {
      result.push({ key: 'Authorization', value: `Bearer ${auth.bearer_token}` })
    } else if (auth.type === 'basic' && auth.basic_username) {
      result.push({ key: 'Authorization', value: `Basic ${btoa(`${auth.basic_username}:${auth.basic_password ?? ''}`)}` })
    } else if (auth.type === 'api-key' && auth.api_key_header) {
      result.push({ key: auth.api_key_header, value: auth.api_key_value ?? '' })
    }
    return result
  })

  // Count badges
  let paramCount = $derived(queryParams.filter((p) => p.key.trim()).length)
  let headerCount = $derived(headers.filter((h) => h.key.trim()).length)

  // --- Actions ---

  function update(partial: Partial<TabRequestState>): void {
    appStore.updateTabState(tabId, partial)
  }

  function handleBodyTypeChange(newType: string): void {
    if (!state) return
    const oldType = state.body_type
    if (oldType === newType) return

    // Save current body to cache under old type, restore from cache for new type
    const cache = { ...(state.bodyCache ?? {}) }
    cache[oldType] = state.body
    const restoredBody = cache[newType] ?? null

    update({ body_type: newType, body: restoredBody, bodyCache: cache })
  }

  async function sendRequest(): Promise<void> {
    if (!state?.url?.trim()) return

    // Auto-save before sending so scripts and latest changes are in DB
    await saveRequest()
    update({ loading: true, response: null })

    // Build headers map
    const headerMap: Record<string, string> = {}
    for (const h of headers) {
      if (h.enabled && h.key.trim()) headerMap[h.key.trim()] = h.value
    }
    // Add implicit headers (auth, content-type will be handled by proxy)
    for (const ih of implicitHeaders) {
      if (!headerMap[ih.key] && !headerMap[ih.key.toLowerCase()]) {
        headerMap[ih.key] = ih.value
      }
    }

    let bodyContent = state.body ?? undefined
    let formDataEntries: FormDataEntry[] | undefined

    if (state.body_type === 'form-data') {
      formDataEntries = formData.filter((e) => e.key.trim())
      bodyContent = undefined
    } else if (state.body_type === 'graphql') {
      // Wrap query + variables as JSON
      try {
        bodyContent = JSON.stringify({ query: state.body ?? '', variables: JSON.parse('{}') })
      } catch {
        bodyContent = JSON.stringify({ query: state.body ?? '' })
      }
    }

    try {
      const response = await window.api.proxy.send(requestId, {
        method: state.method,
        url: state.url.trim(),
        headers: headerMap,
        body: bodyContent,
        bodyType: state.body_type as any,
        formData: formDataEntries,
        workspaceId: appStore.activeWorkspaceId ?? undefined,
        collectionId: collectionsStore.getRequestById(requestId)?.collection_id,
      })
      update({ response, loading: false })

      // Refresh resolved variables and environment store — post-response scripts may have set new values
      refreshResolvedVars()
      environmentsStore.loadAll(appStore.activeWorkspaceId ?? undefined)
    } catch (error) {
      update({
        loading: false,
        response: {
          status: 0,
          statusText: error instanceof Error ? error.message : 'Unknown error',
          headers: {},
          body: String(error),
          size: 0,
          timing: { start: 0, ttfb: 0, total: 0 },
          cookies: [],
        },
      })
    }
  }

  function cancelRequest(): void {
    window.api.proxy.cancel(requestId)
    update({ loading: false })
  }

  async function saveRequest(): Promise<void> {
    if (!state) return

    const bodyToSave = state.body_type === 'form-data'
      ? JSON.stringify(formData)
      : state.body

    await window.api.requests.update(requestId, {
      name: state.name,
      method: state.method,
      url: state.url,
      headers: state.headers,
      query_params: state.query_params,
      body: bodyToSave,
      body_type: state.body_type,
      auth: state.auth,
      scripts: state.scripts,
    })
    appStore.markTabSaved(tabId)
    appStore.updateTabLabel(tabId, state.name, state.method)

    // Trigger git sync if collection has sync enabled (scan for sensitive data first)
    if (currentCollectionId) {
      const collection = collectionsStore.getCollectionById(currentCollectionId)
      if (collection?.sync_enabled) {
        window.api.sync.scanSensitive(currentCollectionId).then((findings) => {
          if (findings.length === 0) {
            window.api.sync.pushCollection(currentCollectionId!).catch(() => {
              // Sync failure is non-blocking
            })
          }
          // If sensitive data found, skip auto-push — user can push manually via context menu
        }).catch(() => {
          // Scan failure is non-blocking
        })
      }
    }
  }

  // Expose save/send for keyboard shortcut binding from App.svelte
  export function save(): Promise<void> { return saveRequest() }
  export function send(): Promise<void> { return sendRequest() }

  let isUnsaved = $derived(appStore.openTabs.find((t) => t.id === tabId)?.isUnsaved ?? false)

  const requestTabs = [
    { key: 'params' as const, label: 'Params', icon: 'params' },
    { key: 'headers' as const, label: 'Headers', icon: 'headers' },
    { key: 'body' as const, label: 'Body', icon: 'body' },
    { key: 'auth' as const, label: 'Auth', icon: 'auth' },
    { key: 'scripts' as const, label: 'Scripts', icon: 'scripts' },
  ] as const

  let layout = $derived(settingsStore.get('request.layout'))

  // --- Draggable splitter ---
  let splitPercent = $state(50)
  let dragging = $state(false)
  let splitContainer = $state<HTMLElement | null>(null)

  function onDividerPointerDown(e: PointerEvent): void {
    e.preventDefault()
    dragging = true
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
  }

  function onDividerPointerMove(e: PointerEvent): void {
    if (!dragging || !splitContainer) return
    const rect = splitContainer.getBoundingClientRect()
    let pct: number
    if (layout === 'rows') {
      pct = ((e.clientY - rect.top) / rect.height) * 100
    } else {
      pct = ((e.clientX - rect.left) / rect.width) * 100
    }
    splitPercent = Math.min(85, Math.max(15, pct))
  }

  function onDividerPointerUp(): void {
    dragging = false
  }
</script>

{#if state}
  <div class="rb-root">
    <!-- URL Bar -->
    <UrlBar
      method={state.method}
      url={state.url}
      loading={state.loading}
      unsaved={isUnsaved}
      onmethodchange={(m) => update({ method: m })}
      onurlchange={(u) => update({ url: u })}
      onsend={sendRequest}
      oncancel={cancelRequest}
      onsave={saveRequest}
    />

    <!-- Split: request tabs + response -->
    <div
      class="rb-split"
      class:rb-split--rows={layout === 'rows'}
      class:rb-split--dragging={dragging}
      bind:this={splitContainer}
    >
      <!-- Request section -->
      <div class="rb-request" style="flex: {splitPercent} 0 0%;">
        <!-- Sub-tabs -->
        <div class="rb-tabs">
          {#each requestTabs as tab}
            {@const count = tab.key === 'params' ? paramCount : tab.key === 'headers' ? headerCount : 0}
            <button
              onclick={() => activeRequestTab = tab.key}
              class="rb-tab"
              class:rb-tab--active={activeRequestTab === tab.key}
            >
              <span class="rb-tab-label">{tab.label}</span>
              {#if count}
                <span class="rb-tab-badge">{count}</span>
              {/if}
            </button>
          {/each}

          <span class="rb-tabs-spacer"></span>

          <button
            onclick={() => showCodeSnippet = true}
            class="rb-tab rb-tab--code"
            title="Generate code snippet"
          >
            &lt;/&gt;
          </button>
        </div>

        <!-- Sub-tab content -->
        <div class="rb-content">
          {#if activeRequestTab === 'params'}
            <ParamsEditor
              params={queryParams}
              url={state.url}
              onparamschange={(p) => update({ query_params: JSON.stringify(p) })}
              onurlchange={(u) => update({ url: u })}
            />
          {:else if activeRequestTab === 'headers'}
            <HeadersEditor
              {headers}
              {implicitHeaders}
              onchange={(h) => update({ headers: JSON.stringify(h) })}
            />
          {:else if activeRequestTab === 'body'}
            <BodyEditor
              bodyType={state.body_type}
              body={state.body_type === 'form-data' ? '' : (state.body ?? '')}
              {formData}
              onbodytypechange={handleBodyTypeChange}
              onbodychange={(b) => update({ body: b })}
              onformdatachange={(d) => update({ body: JSON.stringify(d) })}
            />
          {:else if activeRequestTab === 'auth'}
            <AuthEditor
              {auth}
              onchange={(a) => update({ auth: JSON.stringify(a) })}
            />
          {:else if activeRequestTab === 'scripts'}
            <ScriptsEditor
              {scripts}
              {requestId}
              collectionId={currentCollectionId}
              onchange={(s) => update({ scripts: JSON.stringify(s) })}
            />
          {/if}
        </div>
      </div>

      <!-- Divider -->
      <div
        class="rb-divider"
        role="separator"
        tabindex="-1"
        onpointerdown={onDividerPointerDown}
        onpointermove={onDividerPointerMove}
        onpointerup={onDividerPointerUp}
      ></div>

      <!-- Response section -->
      <div class="rb-response" style="flex: {100 - splitPercent} 0 0%;">
        <ResponseViewer response={state.response} loading={state.loading} />
      </div>
    </div>
  </div>

  <CodeSnippetModal
    open={showCodeSnippet}
    method={state.method}
    url={state.url}
    {headers}
    {queryParams}
    body={state.body ?? ''}
    bodyType={state.body_type}
    formData={formData.map((f) => ({ key: f.key, value: f.value, enabled: f.enabled }))}
    {auth}
    workspaceId={appStore.activeWorkspaceId ?? undefined}
    collectionId={currentCollectionId}
    onclose={() => showCodeSnippet = false}
  />
{:else}
  <div class="rb-empty">
    <p>Select a request to get started</p>
  </div>
{/if}

<style>
  .rb-root {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* --- Split layout (default: columns / side-by-side) --- */
  .rb-split {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .rb-split--dragging {
    user-select: none;
  }

  .rb-request {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .rb-divider {
    flex-shrink: 0;
    width: 5px;
    background: var(--color-surface-700);
    cursor: col-resize;
    position: relative;
    transition: background 0.12s;
  }

  .rb-divider:hover,
  .rb-split--dragging .rb-divider {
    background: var(--color-brand-500);
  }

  .rb-response {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* Rows layout (top / bottom) */
  .rb-split--rows {
    flex-direction: column;
  }

  .rb-split--rows > .rb-divider {
    width: auto;
    height: 5px;
    cursor: row-resize;
  }

  /* --- Sub-tabs --- */
  .rb-tabs {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: 36px;
    border-bottom: 1px solid var(--color-surface-700);
    padding: 0 4px;
    gap: 1px;
  }

  .rb-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border: none;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    position: relative;
    transition: color 0.12s, background 0.12s;
    white-space: nowrap;
  }

  .rb-tab:hover {
    color: var(--color-surface-200);
    background: color-mix(in srgb, var(--color-surface-700) 30%, transparent);
  }

  .rb-tab--active {
    color: var(--color-brand-400);
  }

  .rb-tab--active:hover {
    color: var(--color-brand-400);
  }

  .rb-tab--active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 6px;
    right: 6px;
    height: 2px;
    background: var(--color-brand-500);
    border-radius: 1px 1px 0 0;
  }

  .rb-tab--code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    color: var(--color-surface-500);
    letter-spacing: -0.02em;
  }

  .rb-tab--code:hover {
    color: var(--color-surface-200);
  }

  .rb-tabs-spacer {
    flex: 1;
  }

  .rb-tab-label {
    font-weight: 500;
  }

  .rb-tab-badge {
    font-size: 10px;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--color-surface-600) 60%, transparent);
    color: var(--color-surface-300);
    font-weight: 500;
  }

  .rb-tab--active .rb-tab-badge {
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
    color: var(--color-brand-400);
  }

  /* --- Content --- */
  .rb-content {
    flex: 1;
    overflow: auto;
  }

  /* --- Empty state --- */
  .rb-empty {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
  }

  .rb-empty p {
    font-size: 13px;
    color: var(--color-surface-500);
  }
</style>
