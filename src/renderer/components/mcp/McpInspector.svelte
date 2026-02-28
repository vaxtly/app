<script lang="ts">
  import { appStore, type McpSubTab } from '../../lib/stores/app.svelte'
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import McpServerForm from './McpServerForm.svelte'
  import McpToolsPane from './McpToolsPane.svelte'
  import McpResourcesPane from './McpResourcesPane.svelte'
  import McpPromptsPane from './McpPromptsPane.svelte'
  import McpTrafficPane from './McpTrafficPane.svelte'
  import McpNotificationsPane from './McpNotificationsPane.svelte'

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
  let activeSubTab = $derived(mcpTabState?.activeSubTab ?? 'tools')

  function setSubTab(tab: McpSubTab): void {
    appStore.updateMcpTabState(tabId, { activeSubTab: tab })
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

  const SUB_TABS: { key: McpSubTab; label: string }[] = [
    { key: 'tools', label: 'Tools' },
    { key: 'resources', label: 'Resources' },
    { key: 'prompts', label: 'Prompts' },
    { key: 'traffic', label: 'Traffic' },
    { key: 'notifications', label: 'Notifications' },
  ]
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

    <!-- Sub-tab navigation -->
    <div class="flex shrink-0 items-center gap-1 px-4 py-1.5" style="border-bottom: 1px solid var(--glass-border)">
      {#each SUB_TABS as tab (tab.key)}
        <button
          onclick={() => setSubTab(tab.key)}
          class="rounded-md px-2.5 py-1 text-xs transition-colors
            {activeSubTab === tab.key
              ? 'bg-[var(--tint-active)] text-surface-200'
              : 'text-surface-500 hover:text-surface-300 hover:bg-[var(--tint-subtle)]'}"
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Sub-tab content -->
    <div class="min-h-0 flex-1 overflow-hidden">
      {#if activeSubTab === 'tools'}
        <McpToolsPane {serverId} />
      {:else if activeSubTab === 'resources'}
        <McpResourcesPane {serverId} />
      {:else if activeSubTab === 'prompts'}
        <McpPromptsPane {serverId} />
      {:else if activeSubTab === 'traffic'}
        <McpTrafficPane {serverId} />
      {:else if activeSubTab === 'notifications'}
        <McpNotificationsPane {serverId} />
      {/if}
    </div>
  </div>
{/if}
