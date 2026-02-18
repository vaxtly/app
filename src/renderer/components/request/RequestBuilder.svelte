<script lang="ts">
  import UrlBar from './UrlBar.svelte'
  import ParamsEditor from './ParamsEditor.svelte'
  import HeadersEditor from './HeadersEditor.svelte'
  import BodyEditor from './BodyEditor.svelte'
  import AuthEditor from './AuthEditor.svelte'
  import ScriptsEditor from './ScriptsEditor.svelte'
  import ResponseViewer from '../response/ResponseViewer.svelte'
  import CodeSnippetModal from '../modals/CodeSnippetModal.svelte'
  import { appStore, type TabRequestState } from '../../lib/stores/app.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import type { KeyValueEntry, AuthConfig, ScriptsConfig, FormDataEntry, ResponseData } from '../../lib/types'

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
  let headers = $derived.by((): KeyValueEntry[] => {
    if (!state?.headers) return [{ key: '', value: '', enabled: true }]
    try { return JSON.parse(state.headers) } catch { return [{ key: '', value: '', enabled: true }] }
  })

  let queryParams = $derived.by((): KeyValueEntry[] => {
    if (!state?.query_params) return [{ key: '', value: '', enabled: true }]
    try { return JSON.parse(state.query_params) } catch { return [{ key: '', value: '', enabled: true }] }
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

  let formData = $derived.by((): FormDataEntry[] => {
    if (!state?.body_type || state.body_type !== 'form-data') return [{ key: '', value: '', type: 'text', enabled: true }]
    if (!state.body) return [{ key: '', value: '', type: 'text', enabled: true }]
    try { return JSON.parse(state.body) } catch { return [{ key: '', value: '', type: 'text', enabled: true }] }
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

  async function sendRequest(): Promise<void> {
    if (!state?.url?.trim()) return
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
  }

  // Expose save/send for keyboard shortcut binding from App.svelte
  export function save(): Promise<void> { return saveRequest() }
  export function send(): Promise<void> { return sendRequest() }
</script>

{#if state}
  <div class="flex h-full flex-col">
    <!-- URL Bar -->
    <div class="shrink-0 border-b border-surface-700 px-3 py-2">
      <UrlBar
        method={state.method}
        url={state.url}
        loading={state.loading}
        onmethodchange={(m) => update({ method: m })}
        onurlchange={(u) => update({ url: u })}
        onsend={sendRequest}
        oncancel={cancelRequest}
      />
    </div>

    <!-- Split: request tabs + response -->
    <div class="flex min-h-0 flex-1">
      <!-- Request section -->
      <div class="flex w-1/2 flex-col border-r border-surface-700">
        <!-- Sub-tabs -->
        <div class="flex shrink-0 items-center gap-0.5 border-b border-surface-700 px-2">
          {#each [
            { key: 'params', label: 'Params', count: paramCount },
            { key: 'headers', label: 'Headers', count: headerCount },
            { key: 'body', label: 'Body' },
            { key: 'auth', label: 'Auth' },
            { key: 'scripts', label: 'Scripts' },
          ] as tab}
            <button
              onclick={() => activeRequestTab = tab.key as RequestTab}
              class="px-2.5 py-2 text-xs transition-colors {activeRequestTab === tab.key
                ? 'border-b-2 border-brand-500 text-brand-400'
                : 'text-surface-400 hover:text-surface-200'}"
            >
              {tab.label}
              {#if tab.count}
                <span class="ml-1 rounded-full bg-surface-700 px-1.5 text-[10px] text-surface-300">{tab.count}</span>
              {/if}
            </button>
          {/each}
          <div class="flex-1"></div>
          <button
            onclick={() => showCodeSnippet = true}
            class="px-2 py-2 text-[11px] text-surface-500 hover:text-surface-300"
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
              {implicitHeaders}
              onchange={(h) => update({ headers: JSON.stringify(h) })}
            />
          {:else if activeRequestTab === 'body'}
            <BodyEditor
              bodyType={state.body_type}
              body={state.body_type === 'form-data' ? '' : (state.body ?? '')}
              {formData}
              onbodytypechange={(t) => update({ body_type: t })}
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

      <!-- Response section -->
      <div class="flex w-1/2 flex-col">
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
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-surface-500">Select a request to get started</p>
  </div>
{/if}
