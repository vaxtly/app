<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'

  interface Props {
    serverId: string
  }

  let { serverId }: Props = $props()

  let entries = $derived(mcpStore.trafficLog.filter((e) => e.serverId === serverId))
  let expandedId = $state<string | null>(null)

  function toggleEntry(id: string): void {
    expandedId = expandedId === id ? null : id
  }

  function handleClear(): void {
    mcpStore.clearTraffic(serverId)
    window.api.mcp.traffic.clear(serverId)
  }

  function formatTime(timestamp: string): string {
    const d = new Date(timestamp)
    return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
  }

  function formatJson(data: unknown): string {
    if (data === undefined || data === null) return ''
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="flex shrink-0 items-center gap-2 px-4 py-2" style="border-bottom: 1px solid var(--glass-border)">
    <span class="text-xs text-surface-500">{entries.length} entries</span>
    <div class="flex-1"></div>
    <button
      onclick={handleClear}
      class="rounded-md px-2 py-1 text-[10px] text-surface-500 transition-colors hover:bg-[var(--tint-muted)] hover:text-surface-300"
    >
      Clear
    </button>
  </div>

  <!-- Traffic list -->
  <div class="flex-1 overflow-y-auto">
    {#if entries.length === 0}
      <div class="flex h-full items-center justify-center">
        <p class="text-sm text-surface-500">No traffic recorded</p>
      </div>
    {:else}
      {#each entries as entry (entry.id)}
        <div class="border-b border-[var(--glass-border)]">
          <button
            onclick={() => toggleEntry(entry.id)}
            class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs transition-colors hover:bg-[var(--tint-subtle)]"
          >
            <!-- Direction arrow -->
            <span class="shrink-0 font-mono text-[10px] {entry.direction === 'outgoing' ? 'text-brand-400' : 'text-green-400'}">
              {entry.direction === 'outgoing' ? '\u2192' : '\u2190'}
            </span>

            <!-- Method -->
            <span class="shrink-0 font-mono font-medium text-surface-200">{entry.method}</span>

            <!-- Error indicator -->
            {#if entry.error}
              <span class="shrink-0 text-[10px] text-red-400">ERR</span>
            {/if}

            <div class="flex-1"></div>

            <!-- Timestamp -->
            <span class="shrink-0 font-mono text-[10px] text-surface-600">{formatTime(entry.timestamp)}</span>
          </button>

          {#if expandedId === entry.id}
            <div class="flex flex-col gap-2 px-4 pb-3">
              {#if entry.params !== undefined}
                <div>
                  <span class="text-[10px] uppercase tracking-wider text-surface-500">Params</span>
                  <pre class="mt-1 rounded-md bg-[var(--tint-subtle)] p-2 font-mono text-[11px] text-surface-300">{formatJson(entry.params)}</pre>
                </div>
              {/if}
              {#if entry.result !== undefined}
                <div>
                  <span class="text-[10px] uppercase tracking-wider text-surface-500">Result</span>
                  <pre class="mt-1 max-h-64 overflow-y-auto rounded-md bg-[var(--tint-subtle)] p-2 font-mono text-[11px] text-surface-300">{formatJson(entry.result)}</pre>
                </div>
              {/if}
              {#if entry.error !== undefined}
                <div>
                  <span class="text-[10px] uppercase tracking-wider text-red-400">Error</span>
                  <pre class="mt-1 rounded-md bg-red-500/10 p-2 font-mono text-[11px] text-red-300">{formatJson(entry.error)}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
