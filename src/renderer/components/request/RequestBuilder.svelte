<script lang="ts">
  import UrlBar from './UrlBar.svelte'
  import ParamsEditor from './ParamsEditor.svelte'
  import HeadersEditor from './HeadersEditor.svelte'
  import BodyEditor from './BodyEditor.svelte'
  import AuthEditor from './AuthEditor.svelte'
  import ScriptsEditor from './ScriptsEditor.svelte'
  import ResponseViewer from '../response/ResponseViewer.svelte'
  import CodeSnippetModal from '../modals/CodeSnippetModal.svelte'
  import CollectionPickerModal from '../modals/CollectionPickerModal.svelte'
  import { setContext, untrack } from 'svelte'
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
  let activeRequestTab = $derived<RequestTab>((state?.activeSubTab as RequestTab) ?? 'params')

  // Code snippet modal
  let showCodeSnippet = $state(false)

  // Draft support
  let showCollectionPicker = $state(false)
  let isDraft = $derived(appStore.openTabs.find((t) => t.id === tabId)?.isDraft ?? false)

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
    let cancelled = false
    window.api.variables.resolveWithSource(
      appStore.activeWorkspaceId ?? undefined,
      currentCollectionId,
    ).then((result) => {
      if (!cancelled) resolvedVars = result as Record<string, ResolvedVariable>
    })
    return () => { cancelled = true }
  })

  function getResolvedVariables(): Record<string, ResolvedVariable> {
    return resolvedVars
  }

  /** Refresh the open environment tab after post-scripts may have changed variables. */
  async function refreshOpenEnvTab(): Promise<void> {
    const activeEnv = environmentsStore.activeEnvironment
    if (!activeEnv) return

    const envTabId = `tab-env-${activeEnv.id}`
    const envTabState = appStore.getEnvTabState(envTabId)
    if (!envTabState?.initialized || envTabState.isDirty) return

    if (activeEnv.vault_synced === 1) {
      // Vault-synced: read from main process in-memory cache (post-script already updated it)
      const vars = await window.api.vault.getCachedVariables(activeEnv.id)
      if (vars.length > 0) {
        appStore.updateEnvTabState(envTabId, { variables: vars })
      }
    } else {
      // Non-vault: re-parse from the store (loadAll already refreshed it)
      try {
        const parsed = JSON.parse(activeEnv.variables)
        const vars = parsed.length > 0 ? parsed : [{ key: '', value: '', enabled: true }]
        appStore.updateEnvTabState(envTabId, { name: activeEnv.name, variables: vars })
      } catch { /* ignore */ }
    }
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

  // Sync generated headers into the headers array when body_type or auth changes
  $effect(() => {
    if (!state) return

    // Reactive dependencies — effect re-runs when these change
    const bodyType = state.body_type
    const authType = auth.type
    const bearerToken = auth.bearer_token
    const basicUser = auth.basic_username
    const basicPass = auth.basic_password
    const apiKeyHeader = auth.api_key_header
    const apiKeyValue = auth.api_key_value

    // Compute wanted generated headers
    const wanted: Array<{ key: string; value: string }> = []
    if (bodyType === 'json') wanted.push({ key: 'Content-Type', value: 'application/json' })
    else if (bodyType === 'xml') wanted.push({ key: 'Content-Type', value: 'application/xml' })
    else if (bodyType === 'urlencoded') wanted.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' })
    else if (bodyType === 'graphql') wanted.push({ key: 'Content-Type', value: 'application/json' })

    if (authType === 'bearer' && bearerToken) {
      wanted.push({ key: 'Authorization', value: `Bearer ${bearerToken}` })
    } else if (authType === 'basic' && basicUser) {
      wanted.push({ key: 'Authorization', value: `Basic ${btoa(`${basicUser}:${basicPass ?? ''}`)}` })
    } else if (authType === 'api-key' && apiKeyHeader) {
      wanted.push({ key: apiKeyHeader, value: apiKeyValue ?? '' })
    }

    // Read current headers without tracking (avoids re-running on every keystroke)
    const current: KeyValueEntry[] = untrack(() => headers)

    // Sync: keep user entries, update/add/remove generated
    const wantedByKey = new Map(wanted.map(w => [w.key.toLowerCase(), w]))
    const handled = new Set<string>()
    const result: KeyValueEntry[] = []

    for (const entry of current) {
      if (entry.generated) {
        const match = wantedByKey.get(entry.key.toLowerCase())
        if (match) {
          result.push({ ...entry, key: match.key, value: match.value })
          handled.add(match.key.toLowerCase())
        }
        // else: stale generated entry → drop
      } else {
        result.push(entry)
      }
    }

    // Prepend new generated entries
    const newGen: KeyValueEntry[] = []
    for (const w of wanted) {
      if (!handled.has(w.key.toLowerCase())) {
        newGen.push({ key: w.key, value: w.value, enabled: true, generated: true })
      }
    }

    const final = [...newGen, ...result]
    const finalJson = JSON.stringify(final)
    const currentJson = untrack(() => state!.headers ?? '[]')
    if (finalJson !== currentJson) {
      update({ headers: finalJson })
    }
  })

  // Count badges
  let paramCount = $derived(queryParams.filter((p) => p.key.trim()).length)
  let headerCount = $derived(headers.filter((h) => h.key.trim() && !h.generated).length)

  // "Has content" indicators for tabs without count badges
  let bodyHasContent = $derived.by(() => {
    if (!state) return false
    if (state.body_type === 'none' || !state.body_type) return false
    if (state.body_type === 'form-data') {
      return formData.some((e) => e.key.trim())
    }
    return !!(state.body?.trim())
  })
  let authHasContent = $derived(auth.type !== 'none')
  let scriptsHasContent = $derived(!!(scripts.pre_request || scripts.post_response?.length))

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

    update({ loading: true, response: null })

    // Build headers map (generated + user headers are already merged)
    const headerMap: Record<string, string> = {}
    for (const h of headers) {
      if (h.enabled && h.key.trim()) headerMap[h.key.trim()] = h.value
    }

    let bodyContent = state.body ?? undefined
    let formDataEntries: FormDataEntry[] | undefined

    if (state.body_type === 'form-data') {
      formDataEntries = formData.filter((e) => e.key.trim())
      bodyContent = undefined
    } else if (state.body_type === 'urlencoded' && bodyContent) {
      // Body is stored as JSON entries; serialize enabled ones to URLSearchParams
      try {
        const entries: KeyValueEntry[] = JSON.parse(bodyContent)
        const params = new URLSearchParams()
        for (const e of entries) {
          if (e.enabled && e.key.trim()) params.append(e.key, e.value)
        }
        bodyContent = params.toString()
      } catch {
        // Legacy URLSearchParams format — pass through as-is
      }
    } else if (state.body_type === 'graphql') {
      // Wrap query + variables as JSON
      bodyContent = JSON.stringify({ query: state.body ?? '', variables: {} })
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
      environmentsStore.loadAll(appStore.activeWorkspaceId ?? undefined).then(() => {
        refreshOpenEnvTab()
      })
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

  /** Persist current state to DB only (no sync). Fast path for send. */
  async function saveToDb(): Promise<void> {
    if (!state) return

    const bodyToSave = state.body_type === 'form-data'
      ? JSON.stringify(formData)
      : state.body

    // Strip generated headers — they're recomputed from body_type/auth on load
    const cleanHeaders = JSON.stringify(headers.filter(h => !h.generated))

    await window.api.requests.update(requestId, {
      name: state.name,
      method: state.method,
      url: state.url,
      headers: cleanHeaders,
      query_params: state.query_params,
      body: bodyToSave,
      body_type: state.body_type,
      auth: state.auth,
      scripts: state.scripts,
    })
    appStore.markTabSaved(tabId)
    appStore.updateTabLabel(tabId, state.name, state.method)
  }

  /** Fire-and-forget git sync if the collection has sync enabled. */
  function syncIfNeeded(): void {
    if (!currentCollectionId) return

    collectionsStore.reloadCollection(currentCollectionId).then(async () => {
      const collection = collectionsStore.getCollectionById(currentCollectionId!)
      if (!collection?.sync_enabled) return
      try {
        const findings = await window.api.sync.scanSensitive(currentCollectionId!)
        if (findings.length === 0) {
          const wsId = appStore.activeWorkspaceId ?? undefined
          const pushed = await window.api.sync.pushRequest(currentCollectionId!, requestId, false, wsId)
          if (pushed) {
            await collectionsStore.reloadCollection(currentCollectionId!)
          }
        }
        // If sensitive data found, skip auto-push — user can push manually via context menu
      } catch {
        // Scan failure is non-blocking (error already logged server-side)
      }
    })
  }

  /** Full save: DB write + immediate sync. Used by Ctrl+S explicit save. */
  async function saveRequest(): Promise<void> {
    if (isDraft) {
      showCollectionPicker = true
      return
    }
    await saveToDb()
    // Sync inline so Ctrl+S gives immediate feedback
    if (currentCollectionId) {
      await collectionsStore.reloadCollection(currentCollectionId)
      const collection = collectionsStore.getCollectionById(currentCollectionId)
      if (collection?.sync_enabled) {
        try {
          const findings = await window.api.sync.scanSensitive(currentCollectionId)
          if (findings.length === 0) {
            const wsId = appStore.activeWorkspaceId ?? undefined
            const pushed = await window.api.sync.pushRequest(currentCollectionId, requestId, false, wsId)
            if (pushed) {
              await collectionsStore.reloadCollection(currentCollectionId)
            }
          }
        } catch {
          // Scan failure is non-blocking
        }
      }
    }
  }

  async function handleCollectionSelected(collectionId: string): Promise<void> {
    showCollectionPicker = false
    if (!state) return

    // Create the request in the chosen collection
    const req = await collectionsStore.createRequest(collectionId, state.name || 'New Request')

    // Build clean data to persist
    const bodyToSave = state.body_type === 'form-data'
      ? JSON.stringify(formData)
      : state.body

    const cleanHeaders = JSON.stringify(headers.filter(h => !h.generated))

    await window.api.requests.update(req.id, {
      name: state.name || 'New Request',
      method: state.method,
      url: state.url,
      headers: cleanHeaders,
      query_params: state.query_params,
      body: bodyToSave,
      body_type: state.body_type,
      auth: state.auth,
      scripts: state.scripts,
    })

    // Promote the draft tab to a persisted tab
    appStore.promoteDraft(tabId, req)

    // Reload collection to reflect the new request in the sidebar
    await collectionsStore.reloadCollection(collectionId)
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
  let splitPercent = $state(settingsStore.get('request.splitPercent'))
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
    settingsStore.set('request.splitPercent', splitPercent)
  }

  function onDividerPointerCancel(): void {
    dragging = false
  }
</script>

{#if state}
  <div class="flex flex-col h-full">
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
      class="flex flex-1 min-h-0"
      class:rb-split--rows={layout === 'rows'}
      class:select-none={dragging}
      class:rb-split--dragging={dragging}
      bind:this={splitContainer}
    >
      <!-- Request section -->
      <div class="flex flex-col min-w-0 min-h-0 overflow-hidden" style="flex: {splitPercent} 0 0%;">
        <!-- Sub-tabs -->
        <div class="flex items-stretch shrink-0 h-9 px-1 gap-px" style="border-bottom: 1px solid var(--glass-border)">
          {#each requestTabs as tab (tab.key)}
            {@const count = tab.key === 'params' ? paramCount : tab.key === 'headers' ? headerCount : 0}
            {@const hasDot = tab.key === 'body' ? bodyHasContent : tab.key === 'auth' ? authHasContent : tab.key === 'scripts' ? scriptsHasContent : false}
            {@const isActive = activeRequestTab === tab.key}
            <button
              onclick={() => update({ activeSubTab: tab.key })}
              class="rb-tab flex items-center gap-[5px] px-2.5 my-1 border-none bg-transparent text-xs font-inherit cursor-pointer relative whitespace-nowrap rounded-lg transition-all duration-150 {isActive ? 'rb-tab--active text-brand-400 bg-[var(--tint-active)] shadow-[inset_0_1px_0_var(--glass-highlight)] hover:text-brand-400' : 'text-surface-400 hover:text-surface-200 hover:bg-[var(--tint-subtle)]'}"
            >
              <span class="font-medium">{tab.label}</span>
              {#if count}
                <span class="text-[10px] leading-none py-0.5 px-[5px] rounded-full font-medium {isActive ? 'bg-brand-500/15 text-brand-400' : 'bg-surface-600/60 text-surface-300'}">{count}</span>
              {:else if hasDot}
                <span class="size-1.5 rounded-full {isActive ? 'bg-brand-400' : 'bg-surface-400'}"></span>
              {/if}
            </button>
          {/each}

          <span class="flex-1"></span>

          <button
            onclick={() => showCodeSnippet = true}
            class="rb-tab flex items-center gap-[5px] px-2.5 my-1 border-none bg-transparent font-mono text-[11px] tracking-[-0.02em] text-surface-500 cursor-pointer relative whitespace-nowrap rounded-lg transition-all duration-150 hover:text-surface-200 hover:bg-[var(--tint-subtle)]"
            style="font-feature-settings: var(--font-feature-mono)"
            title="Generate code snippet"
          >
            &lt;/&gt;
          </button>
        </div>

        <!-- Sub-tab content -->
        <div class="flex-1 overflow-auto">
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
              {requestId}
              {isDraft}
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
        onpointercancel={onDividerPointerCancel}
      ></div>

      <!-- Response section -->
      <div class="flex flex-col min-w-0 min-h-0 overflow-hidden" style="flex: {100 - splitPercent} 0 0%;">
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

  {#if showCollectionPicker}
    <CollectionPickerModal
      onselect={handleCollectionSelected}
      onclose={() => showCollectionPicker = false}
    />
  {/if}
{:else}
  <div class="flex h-full items-center justify-center">
    <p class="text-[13px] text-surface-500">Select a request to get started</p>
  </div>
{/if}

<style>
  /* --- Divider (base + pseudo-element + hover/dragging states) --- */
  .rb-divider {
    flex-shrink: 0;
    width: 1px;
    background: var(--border-subtle);
    cursor: col-resize;
    position: relative;
    transition: background 0.15s, width 0.15s;
  }

  .rb-divider::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 3px;
    height: 24px;
    border-radius: 9999px;
    background: transparent;
    transition: background 0.15s;
  }

  .rb-divider::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -3px;
    right: -3px;
  }

  .rb-divider:hover,
  .rb-split--dragging .rb-divider {
    width: 3px;
    background: var(--tint-subtle);
  }

  .rb-divider:hover::before,
  .rb-split--dragging .rb-divider::before {
    background: color-mix(in srgb, var(--color-brand-500) 40%, transparent);
  }

  /* --- Rows layout overrides --- */
  .rb-split--rows {
    flex-direction: column;
  }

  .rb-split--rows > .rb-divider {
    width: auto;
    height: 1px;
    cursor: row-resize;
  }

  .rb-split--rows > .rb-divider::after {
    left: 0;
    right: 0;
    top: -3px;
    bottom: -3px;
  }

  .rb-split--rows > .rb-divider:hover,
  .rb-split--rows.rb-split--dragging > .rb-divider {
    width: auto;
    height: 3px;
  }

  .rb-split--rows > .rb-divider::before {
    width: 24px;
    height: 3px;
  }

  /* Glass pill active indicator — no underline needed */
</style>
