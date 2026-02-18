<script lang="ts">
  import { onMount } from 'svelte'
  import type { SessionLogEntry, RequestHistory } from '../../lib/types'

  let logs = $state<SessionLogEntry[]>([])
  let histories = $state<RequestHistory[]>([])
  let activeLogTab = $state<'logs' | 'history'>('logs')
  let selectedHistoryId = $state<string | null>(null)
  let expanded = $state(false)
  let panelHeight = $state(200)

  // Selected request ID for history (from active tab context)
  interface Props {
    activeRequestId?: string
  }
  let { activeRequestId }: Props = $props()

  onMount(async () => {
    // Load existing logs
    logs = await window.api.log.list()

    // Listen for new log entries pushed from main process
    const cleanup = window.api.on.logPush((entry) => {
      logs = [entry, ...logs].slice(0, 100)
    })

    return cleanup
  })

  // Load history when request changes
  $effect(() => {
    if (activeRequestId && activeLogTab === 'history') {
      loadHistory(activeRequestId)
    }
  })

  async function loadHistory(requestId: string): Promise<void> {
    histories = await window.api.histories.list(requestId)
  }

  async function clearLogs(): Promise<void> {
    await window.api.log.clear()
    logs = []
  }

  function toggleExpanded(): void {
    expanded = !expanded
  }

  function formatTime(timestamp: string): string {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function getCategoryColor(category: SessionLogEntry['category']): string {
    switch (category) {
      case 'http': return 'text-blue-400'
      case 'sync': return 'text-purple-400'
      case 'vault': return 'text-amber-400'
      case 'system': return 'text-surface-400'
      default: return 'text-surface-400'
    }
  }

  function getStatusColor(code: number | null): string {
    if (!code || code === 0) return 'text-red-400'
    if (code < 300) return 'text-green-400'
    if (code < 400) return 'text-amber-400'
    return 'text-red-400'
  }
</script>

<!-- Collapsible bottom panel -->
<div
  class="flex shrink-0 flex-col border-t border-surface-700 bg-surface-900"
  style="height: {expanded ? panelHeight : 28}px"
>
  <!-- Header bar (always visible) -->
  <button
    onclick={toggleExpanded}
    class="flex h-7 shrink-0 items-center gap-2 border-b border-surface-700 px-3 text-xs text-surface-400 hover:text-surface-200"
  >
    <svg
      class="h-3 w-3 transition-transform {expanded ? 'rotate-180' : ''}"
      fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
    >
      <path d="M5 15l7-7 7 7" />
    </svg>
    <span class="font-medium">Console</span>
    {#if logs.length > 0}
      <span class="rounded-full bg-surface-700 px-1.5 text-[10px] text-surface-300">{logs.length}</span>
    {/if}
  </button>

  {#if expanded}
    <!-- Tabs -->
    <div class="flex shrink-0 items-center gap-3 border-b border-surface-700 px-3">
      <button
        onclick={() => activeLogTab = 'logs'}
        class="py-1.5 text-[11px] transition-colors {activeLogTab === 'logs'
          ? 'border-b border-brand-500 text-brand-400'
          : 'text-surface-500 hover:text-surface-300'}"
      >
        Logs
      </button>
      <button
        onclick={() => activeLogTab = 'history'}
        class="py-1.5 text-[11px] transition-colors {activeLogTab === 'history'
          ? 'border-b border-brand-500 text-brand-400'
          : 'text-surface-500 hover:text-surface-300'}"
      >
        History
      </button>

      <div class="flex-1"></div>

      {#if activeLogTab === 'logs'}
        <button
          onclick={clearLogs}
          class="text-[11px] text-surface-500 hover:text-surface-300"
        >
          Clear
        </button>
      {/if}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto font-mono text-[11px]">
      {#if activeLogTab === 'logs'}
        {#if logs.length === 0}
          <div class="flex h-full items-center justify-center text-surface-600">No log entries</div>
        {:else}
          {#each logs as entry}
            <div class="flex items-start gap-2 border-b border-surface-800 px-3 py-1 hover:bg-surface-800/50">
              <span class="shrink-0 text-surface-600">{formatTime(entry.timestamp)}</span>
              <span class="shrink-0 w-12 {getCategoryColor(entry.category)}">{entry.category}</span>
              <span class="shrink-0 text-surface-500">{entry.type}</span>
              <span class="{entry.success ? 'text-surface-300' : 'text-red-400'} min-w-0 truncate">
                {entry.message}
              </span>
            </div>
          {/each}
        {/if}
      {:else}
        {#if !activeRequestId}
          <div class="flex h-full items-center justify-center text-surface-600">Select a request to view history</div>
        {:else if histories.length === 0}
          <div class="flex h-full items-center justify-center text-surface-600">No history for this request</div>
        {:else}
          {#each histories as h}
            <button
              onclick={() => selectedHistoryId = selectedHistoryId === h.id ? null : h.id}
              class="flex w-full items-center gap-2 border-b border-surface-800 px-3 py-1.5 text-left hover:bg-surface-800/50"
            >
              <span class="shrink-0 text-surface-600">{formatTime(h.executed_at)}</span>
              <span class="shrink-0 text-xs font-medium text-surface-400">{h.method}</span>
              <span class="{getStatusColor(h.status_code)} shrink-0">{h.status_code || 'ERR'}</span>
              <span class="min-w-0 truncate text-surface-400">{h.url}</span>
              <span class="ml-auto shrink-0 text-surface-600">{h.duration_ms ? `${h.duration_ms}ms` : '-'}</span>
            </button>
            {#if selectedHistoryId === h.id}
              <div class="border-b border-surface-700 bg-surface-800/30 px-3 py-2 text-[10px]">
                <div class="mb-1 text-surface-500">Request Headers:</div>
                <pre class="mb-2 whitespace-pre-wrap text-surface-400">{h.request_headers ?? 'None'}</pre>
                {#if h.request_body}
                  <div class="mb-1 text-surface-500">Request Body:</div>
                  <pre class="mb-2 max-h-24 overflow-auto whitespace-pre-wrap text-surface-400">{h.request_body}</pre>
                {/if}
                <div class="mb-1 text-surface-500">Response Headers:</div>
                <pre class="mb-2 whitespace-pre-wrap text-surface-400">{h.response_headers ?? 'None'}</pre>
                <div class="mb-1 text-surface-500">Response Body:</div>
                <pre class="max-h-32 overflow-auto whitespace-pre-wrap text-surface-400">{h.response_body ?? 'None'}</pre>
              </div>
            {/if}
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
</div>
