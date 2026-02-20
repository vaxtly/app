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

  let dragging = $state(false)
  let dragStartY = 0
  let dragStartHeight = 0

  function onDragStart(e: PointerEvent): void {
    if (!expanded) return
    e.preventDefault()
    dragging = true
    dragStartY = e.clientY
    dragStartHeight = panelHeight
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
  }

  function onDragMove(e: PointerEvent): void {
    if (!dragging) return
    const delta = dragStartY - e.clientY
    panelHeight = Math.max(100, Math.min(600, dragStartHeight + delta))
  }

  function onDragEnd(): void {
    dragging = false
  }

  function formatTime(timestamp: string): string {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function getCategoryColor(category: SessionLogEntry['category']): string {
    switch (category) {
      case 'http': return 'var(--color-info)'
      case 'sync': return 'var(--color-purple)'
      case 'vault': return 'var(--color-warning)'
      case 'system': return 'var(--color-surface-400)'
      default: return 'var(--color-surface-400)'
    }
  }

  function getStatusColor(code: number | null): string {
    if (!code || code === 0) return 'var(--color-danger)'
    if (code < 300) return 'var(--color-success)'
    if (code < 400) return 'var(--color-warning)'
    return 'var(--color-danger)'
  }
</script>

<!-- Collapsible bottom panel -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex shrink-0 flex-col bg-surface-900"
  class:select-none={dragging}
  style="height: {expanded ? panelHeight : 28}px"
>
  <!-- Drag handle -->
  {#if expanded}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="h-1 shrink-0 cursor-ns-resize border-t border-surface-700 hover:bg-brand-500/20 active:bg-brand-500/30 transition-colors"
      onpointerdown={onDragStart}
      onpointermove={onDragMove}
      onpointerup={onDragEnd}
      onpointercancel={onDragEnd}
    ></div>
  {:else}
    <div class="h-0 shrink-0 border-t border-surface-700"></div>
  {/if}

  <!-- Header bar (always visible) -->
  <div class="flex h-7 shrink-0 items-center border-b border-surface-700 px-1">
    <button
      onclick={() => { if (expanded && activeLogTab === 'logs') { expanded = false } else { expanded = true; activeLogTab = 'logs' } }}
      class="flex items-center gap-1.5 px-2 h-full text-[11px] font-medium transition-colors {activeLogTab === 'logs' && expanded
        ? 'text-brand-400'
        : 'text-surface-400 hover:text-surface-200'}"
    >
      <svg
        class="h-3 w-3 transition-transform {expanded ? 'rotate-180' : ''}"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path d="M5 15l7-7 7 7" />
      </svg>
      Logs
      {#if logs.length > 0}
        <span class="rounded-full bg-surface-700 px-1.5 text-[10px] text-surface-300">{logs.length}</span>
      {/if}
    </button>

    <button
      onclick={() => { if (expanded && activeLogTab === 'history') { expanded = false } else { expanded = true; activeLogTab = 'history' } }}
      class="flex items-center px-2 h-full text-[11px] font-medium transition-colors {activeLogTab === 'history' && expanded
        ? 'text-brand-400'
        : 'text-surface-500 hover:text-surface-300'}"
    >
      History
    </button>

    <div class="flex-1"></div>

    {#if expanded && activeLogTab === 'logs'}
      <button
        onclick={clearLogs}
        class="px-2 text-[11px] text-surface-500 hover:text-surface-300 transition-colors"
      >
        Clear
      </button>
    {/if}
  </div>

  {#if expanded}

    <!-- Content -->
    <div class="flex-1 overflow-auto font-mono text-[11px]">
      {#if activeLogTab === 'logs'}
        {#if logs.length === 0}
          <div class="flex h-full items-center justify-center text-surface-600">No log entries</div>
        {:else}
          {#each logs as entry}
            <div class="flex items-start gap-2 border-b border-surface-800 px-3 py-1 hover:bg-surface-800/50">
              <span class="shrink-0 text-surface-600">{formatTime(entry.timestamp)}</span>
              <span class="shrink-0 w-12" style:color={getCategoryColor(entry.category)}>{entry.category === 'sync' ? 'git' : entry.category}</span>
              <span class="shrink-0 text-surface-500">{entry.type}</span>
              <span class="min-w-0 truncate" style:color={entry.success ? 'var(--color-surface-300)' : 'var(--color-danger)'}>
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
              <span class="shrink-0" style:color={getStatusColor(h.status_code)}>{h.status_code || 'ERR'}</span>
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
