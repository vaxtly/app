<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import ContextMenu from '../shared/ContextMenu.svelte'
  import DeleteSyncedModal from '../modals/DeleteSyncedModal.svelte'
  import SensitiveDataModal from '../modals/SensitiveDataModal.svelte'

  interface Props {
    onmcpserverclick: (serverId: string) => void
    searchFilter: string
  }

  let { onmcpserverclick, searchFilter }: Props = $props()

  let contextMenu = $state<{ x: number; y: number; serverId: string } | null>(null)
  let sensitiveFindings = $state<{ source: string; requestName: string | null; requestId: string | null; field: string; key: string; maskedValue: string }[]>([])
  let showSensitiveModal = $state(false)
  let pendingPushServerId = $state<string | null>(null)
  let deleteSyncedTarget = $state<{ id: string; name: string } | null>(null)

  let filtered = $derived(
    searchFilter
      ? mcpStore.servers.filter((s) => s.name.toLowerCase().includes(searchFilter.toLowerCase()))
      : mcpStore.servers
  )

  function getStatusColor(serverId: string): string {
    const state = mcpStore.connectionStates[serverId]
    if (!state) return 'var(--color-surface-600)'
    switch (state.status) {
      case 'connected': return 'var(--color-success)'
      case 'connecting': return 'var(--color-warning)'
      case 'error': return 'var(--color-error)'
      default: return 'var(--color-surface-600)'
    }
  }

  function handleContextMenu(e: MouseEvent, serverId: string): void {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY, serverId }
  }

  async function toggleSync(serverId: string): Promise<void> {
    const server = mcpStore.servers.find((s) => s.id === serverId)
    if (!server) return
    const enabling = server.sync_enabled === 0
    await mcpStore.updateServer(serverId, { sync_enabled: enabling ? 1 : 0 })
    if (enabling) {
      await pushServer(serverId)
    }
  }

  async function pushServer(serverId: string): Promise<void> {
    try {
      const findings = await window.api.sync.scanMcpSensitive(serverId)
      if (findings.length > 0) {
        sensitiveFindings = findings
        pendingPushServerId = serverId
        showSensitiveModal = true
        return
      }
      await doPushServer(serverId, false)
    } catch (e) {
      console.error('Failed to push MCP server:', e)
    }
  }

  async function doPushServer(serverId: string, sanitize: boolean): Promise<void> {
    const wsId = appStore.activeWorkspaceId ?? undefined
    try {
      await window.api.sync.pushMcpServer(serverId, sanitize, wsId)
    } catch (e) {
      console.error('Failed to push MCP server:', e)
    }
    await mcpStore.loadServers(appStore.activeWorkspaceId!)
  }

  function pushAnyway(): void {
    showSensitiveModal = false
    if (pendingPushServerId) doPushServer(pendingPushServerId, false)
    pendingPushServerId = null
  }

  function pushSanitized(): void {
    showSensitiveModal = false
    if (pendingPushServerId) doPushServer(pendingPushServerId, true)
    pendingPushServerId = null
  }

  function handleDelete(serverId: string): void {
    const server = mcpStore.servers.find((s) => s.id === serverId)
    if (!server) return
    if (server.sync_enabled === 1) {
      deleteSyncedTarget = { id: server.id, name: server.name }
      return
    }
    mcpStore.deleteServer(serverId)
  }

  async function handleDeleteSynced(resolution: 'local-only' | 'everywhere'): Promise<void> {
    if (!deleteSyncedTarget) return
    const serverId = deleteSyncedTarget.id
    deleteSyncedTarget = null
    if (resolution === 'everywhere') {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.deleteMcpServerRemote(serverId, wsId)
    }
    await mcpStore.deleteServer(serverId)
  }

  async function pullServer(serverId: string): Promise<void> {
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pullMcpServer(serverId, wsId)
      await mcpStore.loadServers(appStore.activeWorkspaceId!)
    } catch (e) {
      console.error('Failed to pull MCP server:', e)
    }
  }

  async function exportServer(serverId: string): Promise<void> {
    try {
      const server = mcpStore.servers.find((s) => s.id === serverId)
      const data = await window.api.data.exportMcpServer(serverId)
      const json = JSON.stringify(data, null, 2)
      const slug = (server?.name ?? 'server').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const date = new Date().toISOString().slice(0, 10)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vaxtly-mcp-server-${slug}-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export MCP server:', e)
    }
  }

  function getContextMenuItems(serverId: string) {
    const state = mcpStore.connectionStates[serverId]
    const isConnected = state?.status === 'connected'
    const server = mcpStore.servers.find((s) => s.id === serverId)
    const syncEnabled = server?.sync_enabled === 1

    return [
      { label: 'Connect', action: () => mcpStore.connect(serverId), disabled: isConnected, icon: 'M5.636 18.364a9 9 0 0 1 0-12.728m12.728 0a9 9 0 0 1 0 12.728M9.172 15.828a4.5 4.5 0 0 1 0-6.364m5.656 0a4.5 4.5 0 0 1 0 6.364M12 12h.008v.008H12V12Z' },
      { label: 'Disconnect', action: () => mcpStore.disconnect(serverId), disabled: !isConnected, icon: 'M6 18 18 6M6 6l12 12' },
      { label: '', action: () => {}, separator: true },
      { label: 'Edit', action: () => onmcpserverclick(serverId), icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z' },
      { label: '', action: () => {}, separator: true },
      { label: syncEnabled ? 'Disable Sync' : 'Enable Sync', action: () => toggleSync(serverId), icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992' },
      ...(syncEnabled ? [
        { label: '', action: () => {}, separator: true },
        { label: 'Push to Remote', action: () => pushServer(serverId), icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5' },
        { label: 'Pull from Remote', action: () => pullServer(serverId), icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3' },
      ] : []),
      { label: '', action: () => {}, separator: true },
      { label: 'Export', action: () => exportServer(serverId), icon: 'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0-12.814a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0 12.814a2.25 2.25 0 1 0 3.933 2.185 2.25 2.25 0 0 0-3.933-2.185Z' },
      { label: '', action: () => {}, separator: true },
      { label: 'Delete', action: () => handleDelete(serverId), danger: true, icon: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' },
    ]
  }
</script>

<div class="flex flex-col gap-0.5 px-1">
  {#each filtered as server (server.id)}
    <button
      class="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all duration-150 hover:bg-[var(--tint-hover)]"
      onclick={() => onmcpserverclick(server.id)}
      oncontextmenu={(e) => handleContextMenu(e, server.id)}
    >
      <!-- Status dot -->
      <span
        class="h-2 w-2 shrink-0 rounded-full"
        style:background={getStatusColor(server.id)}
      ></span>

      <!-- Server name -->
      <span class="min-w-0 flex-1 truncate text-surface-300">{server.name}</span>

      <!-- Sync indicator -->
      {#if server.sync_enabled === 1}
        <svg class="h-3 w-3 shrink-0" style:color={server.is_dirty === 1 ? 'var(--color-warning)' : 'var(--color-success)'} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" title={server.is_dirty === 1 ? 'Unsaved changes' : 'Synced'}>
          <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      {/if}

      <!-- Transport badge -->
      <span class="shrink-0 rounded bg-[var(--tint-muted)] px-1 py-0.5 text-[9px] uppercase tracking-wider text-surface-500">
        {server.transport_type === 'streamable-http' ? 'HTTP' : server.transport_type.toUpperCase()}
      </span>
    </button>
  {/each}

  {#if filtered.length === 0 && !searchFilter}
    <p class="px-2 py-4 text-center text-xs text-surface-500">
      No MCP servers configured
    </p>
  {/if}
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems(contextMenu.serverId)}
    onclose={() => contextMenu = null}
  />
{/if}

{#if deleteSyncedTarget}
  <DeleteSyncedModal
    name={deleteSyncedTarget.name}
    ondelete={handleDeleteSynced}
    onclose={() => { deleteSyncedTarget = null }}
  />
{/if}

{#if showSensitiveModal}
  <SensitiveDataModal
    findings={sensitiveFindings}
    onclose={() => { showSensitiveModal = false; pendingPushServerId = null }}
    onsyncanyway={pushAnyway}
    onsyncwithout={pushSanitized}
  />
{/if}
