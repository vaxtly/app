<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import ContextMenu from '../shared/ContextMenu.svelte'

  interface Props {
    onmcpserverclick: (serverId: string) => void
    searchFilter: string
  }

  let { onmcpserverclick, searchFilter }: Props = $props()

  let contextMenu = $state<{ x: number; y: number; serverId: string } | null>(null)

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

  function getContextMenuItems(serverId: string) {
    const state = mcpStore.connectionStates[serverId]
    const isConnected = state?.status === 'connected'
    return [
      { label: 'Connect', action: () => mcpStore.connect(serverId), disabled: isConnected, icon: 'M5.636 18.364a9 9 0 0 1 0-12.728m12.728 0a9 9 0 0 1 0 12.728M9.172 15.828a4.5 4.5 0 0 1 0-6.364m5.656 0a4.5 4.5 0 0 1 0 6.364M12 12h.008v.008H12V12Z' },
      { label: 'Disconnect', action: () => mcpStore.disconnect(serverId), disabled: !isConnected, icon: 'M6 18 18 6M6 6l12 12' },
      { label: '', action: () => {}, separator: true },
      { label: 'Edit', action: () => onmcpserverclick(serverId), icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z' },
      { label: '', action: () => {}, separator: true },
      { label: 'Delete', action: () => mcpStore.deleteServer(serverId), danger: true, icon: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' },
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
