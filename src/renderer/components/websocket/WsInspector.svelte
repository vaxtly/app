<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { wsStore } from '../../lib/stores/websocket.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import WsConnectionBar from './WsConnectionBar.svelte'
  import WsMessageLog from './WsMessageLog.svelte'
  import WsMessageComposer from './WsMessageComposer.svelte'
  import HeadersEditor from '../request/HeadersEditor.svelte'
  import type { KeyValueEntry } from '../../lib/types'
  import type { ResolvedVariable } from '../../lib/utils/variable-highlight'

  interface Props {
    tabId: string
    connectionId: string
  }

  let { tabId, connectionId }: Props = $props()

  let activeSubTab = $state<'messages' | 'headers'>('messages')

  // Resolved variables for VarInput highlighting
  let currentCollectionId = $derived(collectionsStore.getRequestById(connectionId)?.collection_id)
  let resolvedVars = $state<Record<string, ResolvedVariable>>({})

  $effect(() => {
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

  setContext('resolvedVars', getResolvedVariables)

  let wsTabState = $derived(appStore.getWsTabState(tabId))
  let url = $derived(wsTabState?.url ?? '')
  let headersJson = $derived(wsTabState?.headers ?? null)
  let composerMessage = $derived(wsTabState?.composerMessage ?? '')
  let composerType = $derived(wsTabState?.composerType ?? 'text')
  let connState = $derived(wsStore.getState(connectionId))
  let status = $derived(connState?.status ?? 'disconnected')
  let isConnected = $derived(status === 'connected')
  let messages = $derived(wsStore.getMessages(connectionId))
  let unsaved = $derived(appStore.openTabs.find((t) => t.id === tabId)?.isUnsaved ?? false)

  let headers = $derived.by((): KeyValueEntry[] => {
    if (!headersJson) return []
    try { return JSON.parse(headersJson) } catch { return [] }
  })

  // Load saved messages on mount
  onMount(() => {
    wsStore.loadMessages(connectionId)
  })

  async function handleConnect(): Promise<void> {
    const request = collectionsStore.getRequestById(connectionId)
    try {
      await wsStore.connect(connectionId, {
        url,
        headers: headersJson,
        protocols: wsTabState?.protocols,
        workspaceId: appStore.activeWorkspaceId ?? undefined,
        collectionId: request?.collection_id,
      })
      activeSubTab = 'messages'
    } catch {
      // Error reflected in connection state
    }
  }

  async function handleDisconnect(): Promise<void> {
    await wsStore.disconnect(connectionId)
  }

  function handleUrlChange(value: string): void {
    appStore.updateWsTabState(tabId, { url: value })
  }

  function handleHeadersChange(entries: KeyValueEntry[]): void {
    appStore.updateWsTabState(tabId, { headers: JSON.stringify(entries) })
  }

  function handleComposerChange(value: string): void {
    appStore.updateWsTabState(tabId, { composerMessage: value })
  }

  function handleComposerTypeChange(type: 'text' | 'json'): void {
    appStore.updateWsTabState(tabId, { composerType: type })
  }

  async function handleSend(): Promise<void> {
    if (!composerMessage.trim() || !isConnected) return
    try {
      await wsStore.sendMessage(connectionId, composerMessage)
      appStore.updateWsTabState(tabId, { composerMessage: '' })
    } catch {
      // Error handled by connection state
    }
  }

  async function handleSave(): Promise<void> {
    const request = collectionsStore.getRequestById(connectionId)
    await window.api.requests.update(connectionId, {
      url,
      headers: headersJson,
      name: wsTabState?.name ?? 'WebSocket',
    })
    appStore.markWsTabSaved(tabId)
    if (request) {
      await collectionsStore.reloadCollection(request.collection_id)
    }
  }

  async function handleClearMessages(): Promise<void> {
    await wsStore.clearMessages(connectionId)
  }
</script>

<div class="flex h-full flex-col">
  <!-- Connection bar -->
  <WsConnectionBar
    {url}
    {status}
    {unsaved}
    onurlchange={handleUrlChange}
    onconnect={handleConnect}
    ondisconnect={handleDisconnect}
    onsave={handleSave}
  />

  <!-- Status bar -->
  {#if status === 'error' && connState?.error}
    <div class="flex items-center gap-2 px-3 py-1.5 text-xs" style="background: color-mix(in srgb, var(--color-danger) 8%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--color-danger) 20%, transparent)">
      <svg class="h-3.5 w-3.5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
      </svg>
      <span class="text-red-300">{connState.error}</span>
    </div>
  {:else if isConnected}
    <div class="flex items-center gap-2 px-3 py-1" style="border-bottom: 1px solid var(--glass-border)">
      <span class="h-1.5 w-1.5 rounded-full" style="background: var(--color-success)"></span>
      <span class="text-[10px] text-surface-500">Connected</span>
      {#if connState?.messageCount}
        <span class="text-[10px] text-surface-600">{connState.messageCount} messages</span>
      {/if}
    </div>
  {/if}

  <!-- Sub-tab bar -->
  <div class="flex shrink-0 items-center gap-0.5 px-3" style="border-bottom: 1px solid var(--glass-border)">
    <button
      class="rounded-t px-3 py-1.5 text-xs font-medium transition-colors {activeSubTab === 'messages' ? 'text-surface-200' : 'text-surface-500 hover:text-surface-300'}"
      class:sub-tab-active={activeSubTab === 'messages'}
      onclick={() => activeSubTab = 'messages'}
    >
      Messages
    </button>
    <button
      class="rounded-t px-3 py-1.5 text-xs font-medium transition-colors {activeSubTab === 'headers' ? 'text-surface-200' : 'text-surface-500 hover:text-surface-300'}"
      class:sub-tab-active={activeSubTab === 'headers'}
      onclick={() => activeSubTab = 'headers'}
    >
      Headers
    </button>
  </div>

  <!-- Content -->
  <div class="flex min-h-0 flex-1 flex-col">
    {#if activeSubTab === 'messages'}
      <div class="flex min-h-0 flex-1 flex-col relative">
        <!-- Message log -->
        <div class="flex-1 overflow-hidden">
          <WsMessageLog {messages} onclear={handleClearMessages} />
        </div>
        <!-- Composer -->
        <WsMessageComposer
          message={composerMessage}
          messageType={composerType}
          connected={isConnected}
          onmessagechange={handleComposerChange}
          ontypechange={handleComposerTypeChange}
          onsend={handleSend}
        />
      </div>
    {:else}
      <HeadersEditor
        {headers}
        onchange={handleHeadersChange}
      />
    {/if}
  </div>
</div>

<style>
  .sub-tab-active {
    box-shadow: inset 0 -2px 0 var(--color-method-ws);
  }
</style>
