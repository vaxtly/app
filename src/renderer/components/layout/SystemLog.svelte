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

  function getCategoryLabel(category: SessionLogEntry['category']): string {
    return category === 'sync' ? 'git' : category
  }

  /** Parse and highlight git refs, URLs, and paths in log messages */
  function formatLogMessage(message: string): Array<{ text: string; type: 'text' | 'code' | 'url' }> {
    const segments: Array<{ text: string; type: 'text' | 'code' | 'url' }> = []
    // Match git refs (origin/main, HEAD, sha-like), paths (/foo/bar), and URLs
    const pattern = /(\b(?:origin\/[\w\-.]+|HEAD|main|master|[a-f0-9]{7,40})\b|https?:\/\/[^\s]+)/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(message)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: message.slice(lastIndex, match.index), type: 'text' })
      }
      const isUrl = match[0].startsWith('http')
      segments.push({ text: match[0], type: isUrl ? 'url' : 'code' })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < message.length) {
      segments.push({ text: message.slice(lastIndex), type: 'text' })
    }
    return segments.length > 0 ? segments : [{ text: message, type: 'text' }]
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
  class="flex flex-col shrink-0 bg-surface-900"
  class:select-none={dragging}
  style="height: {expanded ? panelHeight : 32}px"
>
  <!-- Drag handle -->
  {#if expanded}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="sl-drag h-1 shrink-0 cursor-ns-resize transition-colors duration-100"
      style="border-top: 1px solid var(--border-default)"
      onpointerdown={onDragStart}
      onpointermove={onDragMove}
      onpointerup={onDragEnd}
      onpointercancel={onDragEnd}
    ></div>
  {/if}

  <!-- Header bar (always visible) -->
  <div class="flex items-center h-8 shrink-0 px-1" style="border-top: 1px solid var(--border-default)">
    <button
      onclick={() => { if (expanded && activeLogTab === 'logs') { expanded = false } else { expanded = true; activeLogTab = 'logs' } }}
      class="flex items-center gap-1.5 px-2 h-full border-none bg-transparent font-mono text-[11px] font-medium cursor-pointer transition-colors duration-100 {activeLogTab === 'logs' && expanded ? 'text-brand-400' : 'text-surface-400 hover:text-surface-200'}"
      style="font-feature-settings: var(--font-feature-mono)"
    >
      <svg
        class="sl-tab-chevron w-3 h-3"
        class:sl-tab-chevron--open={expanded}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path d="M5 15l7-7 7 7" />
      </svg>
      Logs
      {#if logs.length > 0}
        <span class="px-1.5 py-px rounded-full bg-surface-700 text-[10px] font-medium text-surface-300">{logs.length}</span>
      {/if}
    </button>

    <button
      onclick={() => { if (expanded && activeLogTab === 'history') { expanded = false } else { expanded = true; activeLogTab = 'history' } }}
      class="flex items-center gap-1.5 px-2 h-full border-none bg-transparent font-mono text-[11px] font-medium cursor-pointer transition-colors duration-100 {activeLogTab === 'history' && expanded ? 'text-brand-400' : 'text-surface-400 hover:text-surface-200'}"
      style="font-feature-settings: var(--font-feature-mono)"
    >
      History
    </button>

    <div class="flex-1"></div>

    {#if expanded && activeLogTab === 'logs'}
      <button onclick={clearLogs} class="px-2 border-none bg-transparent text-[11px] text-surface-500 cursor-pointer transition-colors duration-100 hover:text-surface-300">Clear</button>
    {/if}
  </div>

  {#if expanded}
    <!-- Content -->
    <div class="flex-1 overflow-auto font-mono text-[11px]" style="font-feature-settings: var(--font-feature-mono)">
      {#if activeLogTab === 'logs'}
        {#if logs.length === 0}
          <div class="flex h-full items-center justify-center text-surface-600">No log entries</div>
        {:else}
          {#each logs as entry (entry.timestamp + entry.message)}
            <div
              class="flex items-center gap-2 h-7 px-3 transition-colors duration-100 hover:bg-surface-800/50"
              style="border-bottom: 1px solid var(--border-muted)"
            >
              <span class="shrink-0 w-18 text-surface-600" style="font-variant-numeric: tabular-nums">{formatTime(entry.timestamp)}</span>
              <span class="sl-badge" style="--cat-color: {getCategoryColor(entry.category)}">{getCategoryLabel(entry.category)}</span>
              <span class="shrink-0 w-16 text-surface-500">{entry.type}</span>
              <span class="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap {entry.success ? 'text-surface-300' : 'text-danger'}">
                {#each formatLogMessage(entry.message) as seg, i (i)}
                  {#if seg.type === 'code'}
                    <span class="px-1 py-px rounded-xs bg-surface-700/50 text-brand-400 text-[10px]">{seg.text}</span>
                  {:else if seg.type === 'url'}
                    <span class="px-1 py-px rounded-xs bg-surface-700/50 text-brand-400 text-[10px]">{seg.text}</span>
                  {:else}
                    {seg.text}
                  {/if}
                {/each}
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
          {#each histories as h (h.id)}
            <button
              onclick={() => selectedHistoryId = selectedHistoryId === h.id ? null : h.id}
              class="flex w-full items-center gap-2 h-7 px-3 border-none bg-transparent text-left cursor-pointer transition-colors duration-100 font-mono text-[11px] hover:bg-surface-800/50"
              style="border-bottom: 1px solid var(--border-muted); font-feature-settings: var(--font-feature-mono)"
            >
              <span class="shrink-0 w-18 text-surface-600" style="font-variant-numeric: tabular-nums">{formatTime(h.executed_at)}</span>
              <span class="shrink-0 font-medium text-surface-400">{h.method}</span>
              <span class="shrink-0" style="font-variant-numeric: tabular-nums; color: {getStatusColor(h.status_code)}">{h.status_code || 'ERR'}</span>
              <span class="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-surface-400">{h.url}</span>
              <span class="shrink-0 text-surface-600" style="font-variant-numeric: tabular-nums">{h.duration_ms ? `${h.duration_ms}ms` : '-'}</span>
            </button>
            {#if selectedHistoryId === h.id}
              <div class="px-3 py-2 text-[10px] bg-surface-800/30" style="border-bottom: 1px solid var(--border-default)">
                <div class="mb-1 text-surface-500">Request Headers:</div>
                <pre class="whitespace-pre-wrap text-surface-400 mb-2">{h.request_headers ?? 'None'}</pre>
                {#if h.request_body}
                  <div class="mb-1 text-surface-500">Request Body:</div>
                  <pre class="whitespace-pre-wrap text-surface-400 mb-2 max-h-24 overflow-auto">{h.request_body}</pre>
                {/if}
                <div class="mb-1 text-surface-500">Response Headers:</div>
                <pre class="whitespace-pre-wrap text-surface-400 mb-2">{h.response_headers ?? 'None'}</pre>
                <div class="mb-1 text-surface-500">Response Body:</div>
                <pre class="whitespace-pre-wrap text-surface-400 mb-2 max-h-32 overflow-auto">{h.response_body ?? 'None'}</pre>
              </div>
            {/if}
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Drag handle hover/active — uses color-mix with brand */
  .sl-drag:hover {
    background: color-mix(in srgb, var(--color-brand-500) 20%, transparent);
  }

  .sl-drag:active {
    background: color-mix(in srgb, var(--color-brand-500) 30%, transparent);
  }

  /* Chevron rotation transition */
  .sl-tab-chevron {
    transition: transform 0.15s;
  }

  .sl-tab-chevron--open {
    transform: rotate(180deg);
  }

  /* Badge with dynamic --cat-color CSS variable */
  .sl-badge {
    flex-shrink: 0;
    width: 48px;
    text-align: center;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-size: 10px;
    font-weight: 500;
    color: var(--cat-color);
    background: color-mix(in srgb, var(--cat-color) 12%, transparent);
  }
</style>
