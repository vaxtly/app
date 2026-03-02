<script lang="ts">
  import { appStore, type McpLeftTab, type McpRightTab, type McpLastResponse } from '../../lib/stores/app.svelte'
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import McpServerForm from './McpServerForm.svelte'
  import McpToolsPane from './McpToolsPane.svelte'
  import McpResourcesPane from './McpResourcesPane.svelte'
  import McpPromptsPane from './McpPromptsPane.svelte'
  import McpTrafficPane from './McpTrafficPane.svelte'
  import McpNotificationsPane from './McpNotificationsPane.svelte'
  import McpResponsePane from './McpResponsePane.svelte'

  interface Props {
    tabId: string
    serverId: string
  }

  let { tabId, serverId }: Props = $props()

  let showConfig = $state(false)

  let server = $derived(mcpStore.servers.find((s) => s.id === serverId))
  let connectionState = $derived(mcpStore.connectionStates[serverId])
  let status = $derived(connectionState?.status ?? 'disconnected')
  let mcpTabState = $derived(appStore.getMcpTabState(tabId))
  let activeLeftTab = $derived(mcpTabState?.activeLeftTab ?? 'tools')
  let activeRightTab = $derived(mcpTabState?.activeRightTab ?? 'response')
  let lastResponse = $derived(mcpTabState?.lastResponse ?? null)

  function setLeftTab(tab: McpLeftTab): void {
    appStore.updateMcpTabState(tabId, { activeLeftTab: tab })
  }

  function setRightTab(tab: McpRightTab): void {
    appStore.updateMcpTabState(tabId, { activeRightTab: tab })
  }

  function handleMcpResult(response: McpLastResponse): void {
    appStore.updateMcpTabState(tabId, { lastResponse: response })
    // Auto-switch to response tab when a result (not loading) arrives
    if (!response.loading) {
      appStore.updateMcpTabState(tabId, { activeRightTab: 'response' })
    }
  }

  async function handleConnect(): Promise<void> {
    try {
      await mcpStore.connect(serverId)
    } catch {
      // Error is reflected in connectionState
    }
  }

  async function handleDisconnect(): Promise<void> {
    await mcpStore.disconnect(serverId)
  }

  function getStatusLabel(s: string): string {
    switch (s) {
      case 'connected': return 'Connected'
      case 'connecting': return 'Connecting...'
      case 'error': return 'Error'
      default: return 'Disconnected'
    }
  }

  function getStatusDotColor(s: string): string {
    switch (s) {
      case 'connected': return 'var(--color-success)'
      case 'connecting': return 'var(--color-warning)'
      case 'error': return 'var(--color-error)'
      default: return 'var(--color-surface-600)'
    }
  }

  const LEFT_TABS: { key: McpLeftTab; label: string }[] = [
    { key: 'tools', label: 'Tools' },
    { key: 'resources', label: 'Resources' },
    { key: 'prompts', label: 'Prompts' },
  ]

  const RIGHT_TABS: { key: McpRightTab; label: string }[] = [
    { key: 'response', label: 'Response' },
    { key: 'traffic', label: 'Traffic' },
    { key: 'notifications', label: 'Notifications' },
  ]

  // --- Draggable splitter ---
  let splitPercent = $state(settingsStore.get('mcp.splitPercent'))
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
    const pct = ((e.clientX - rect.left) / rect.width) * 100
    splitPercent = Math.min(85, Math.max(15, pct))
  }

  function onDividerPointerUp(): void {
    dragging = false
    settingsStore.set('mcp.splitPercent', splitPercent)
  }

  function onDividerPointerCancel(): void {
    dragging = false
  }
</script>

{#if !server}
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-surface-500">Server not found</p>
  </div>
{:else if showConfig}
  <McpServerForm {serverId} onclose={() => { showConfig = false }} />
{:else}
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex shrink-0 items-center gap-3 px-4 py-3" style="border-bottom: 1px solid var(--glass-border)">
      <!-- Status dot -->
      <span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background={getStatusDotColor(status)}></span>

      <!-- Server name -->
      <h2 class="min-w-0 flex-1 truncate text-sm font-medium text-surface-200">{server.name}</h2>

      <!-- Transport badge -->
      <span class="shrink-0 rounded bg-[var(--tint-muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-surface-400">
        {server.transport_type === 'streamable-http' ? 'HTTP' : server.transport_type.toUpperCase()}
      </span>

      <!-- Server info -->
      {#if connectionState?.serverInfo}
        <span class="text-[10px] text-surface-500">
          {connectionState.serverInfo.name} v{connectionState.serverInfo.version}
        </span>
      {/if}

      <!-- Status label -->
      <span class="text-xs text-surface-500">{getStatusLabel(status)}</span>

      <!-- Config button -->
      <button
        onclick={() => { showConfig = true }}
        class="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-surface-400 transition-colors hover:bg-[var(--tint-muted)] hover:text-surface-200"
      >
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        Configure
      </button>

      <!-- Connect/Disconnect button -->
      {#if status === 'connected'}
        <button
          onclick={handleDisconnect}
          class="flex h-7 items-center gap-1.5 rounded-md border border-[var(--glass-border)] bg-[var(--tint-muted)] px-3 text-xs text-surface-300 transition-colors hover:bg-[var(--tint-strong)] hover:text-surface-100"
        >
          Disconnect
        </button>
      {:else}
        <button
          onclick={handleConnect}
          disabled={status === 'connecting'}
          class="flex h-7 items-center gap-1.5 rounded-md border border-brand-500/30 bg-brand-500/15 px-3 text-xs text-brand-300 transition-colors hover:bg-brand-500/25 disabled:opacity-50"
        >
          {status === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      {/if}
    </div>

    <!-- Error banner -->
    {#if connectionState?.error}
      <div class="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
        {connectionState.error}
      </div>
    {/if}

    <!-- Split panel -->
    <div
      class="flex min-h-0 flex-1"
      class:select-none={dragging}
      class:mcp-split--dragging={dragging}
      bind:this={splitContainer}
    >
      <!-- Left panel -->
      <div class="flex min-h-0 min-w-0 flex-col overflow-hidden" style="flex: {splitPercent} 0 0%;">
        <!-- Left tab bar -->
        <div class="flex shrink-0 items-center gap-1 px-4 py-1.5" style="border-bottom: 1px solid var(--glass-border)">
          {#each LEFT_TABS as tab (tab.key)}
            <button
              onclick={() => setLeftTab(tab.key)}
              class="rounded-md px-2.5 py-1 text-xs transition-colors
                {activeLeftTab === tab.key
                  ? 'bg-[var(--tint-active)] text-surface-200'
                  : 'text-surface-500 hover:text-surface-300 hover:bg-[var(--tint-subtle)]'}"
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <!-- Left content -->
        <div class="min-h-0 flex-1 overflow-hidden">
          {#if activeLeftTab === 'tools'}
            <McpToolsPane {serverId} oncallresult={handleMcpResult} />
          {:else if activeLeftTab === 'resources'}
            <McpResourcesPane {serverId} onreadresult={handleMcpResult} />
          {:else if activeLeftTab === 'prompts'}
            <McpPromptsPane {serverId} ongetresult={handleMcpResult} />
          {/if}
        </div>
      </div>

      <!-- Divider -->
      <div
        class="mcp-divider"
        role="separator"
        tabindex="-1"
        onpointerdown={onDividerPointerDown}
        onpointermove={onDividerPointerMove}
        onpointerup={onDividerPointerUp}
        onpointercancel={onDividerPointerCancel}
      ></div>

      <!-- Right panel -->
      <div class="flex min-h-0 min-w-0 flex-col overflow-hidden" style="flex: {100 - splitPercent} 0 0%;">
        <!-- Right tab bar -->
        <div class="flex shrink-0 items-center gap-1 px-4 py-1.5" style="border-bottom: 1px solid var(--glass-border)">
          {#each RIGHT_TABS as tab (tab.key)}
            <button
              onclick={() => setRightTab(tab.key)}
              class="rounded-md px-2.5 py-1 text-xs transition-colors
                {activeRightTab === tab.key
                  ? 'bg-[var(--tint-active)] text-surface-200'
                  : 'text-surface-500 hover:text-surface-300 hover:bg-[var(--tint-subtle)]'}"
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <!-- Right content -->
        <div class="min-h-0 flex-1 overflow-hidden">
          {#if activeRightTab === 'response'}
            <McpResponsePane response={lastResponse} />
          {:else if activeRightTab === 'traffic'}
            <McpTrafficPane {serverId} />
          {:else if activeRightTab === 'notifications'}
            <McpNotificationsPane {serverId} />
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* --- Divider (base + pseudo-element + hover/dragging states) --- */
  .mcp-divider {
    flex-shrink: 0;
    width: 1px;
    background: var(--border-subtle);
    cursor: col-resize;
    position: relative;
    transition: background 0.15s, width 0.15s;
  }

  .mcp-divider::before {
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

  .mcp-divider::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -3px;
    right: -3px;
  }

  .mcp-divider:hover,
  .mcp-split--dragging .mcp-divider {
    width: 3px;
    background: var(--tint-subtle);
  }

  .mcp-divider:hover::before,
  .mcp-split--dragging .mcp-divider::before {
    background: color-mix(in srgb, var(--color-brand-500) 40%, transparent);
  }
</style>
