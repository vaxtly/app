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
  class="sl-root"
  class:select-none={dragging}
  style="height: {expanded ? panelHeight : 32}px"
>
  <!-- Drag handle -->
  {#if expanded}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="sl-drag"
      onpointerdown={onDragStart}
      onpointermove={onDragMove}
      onpointerup={onDragEnd}
      onpointercancel={onDragEnd}
    ></div>
  {:else}
    <div class="sl-drag-collapsed"></div>
  {/if}

  <!-- Header bar (always visible) -->
  <div class="sl-header">
    <button
      onclick={() => { if (expanded && activeLogTab === 'logs') { expanded = false } else { expanded = true; activeLogTab = 'logs' } }}
      class="sl-tab"
      class:sl-tab--active={activeLogTab === 'logs' && expanded}
    >
      <svg
        class="sl-tab-chevron"
        class:sl-tab-chevron--open={expanded}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path d="M5 15l7-7 7 7" />
      </svg>
      Logs
      {#if logs.length > 0}
        <span class="sl-count">{logs.length}</span>
      {/if}
    </button>

    <button
      onclick={() => { if (expanded && activeLogTab === 'history') { expanded = false } else { expanded = true; activeLogTab = 'history' } }}
      class="sl-tab"
      class:sl-tab--active={activeLogTab === 'history' && expanded}
    >
      History
    </button>

    <div class="sl-spacer"></div>

    {#if expanded && activeLogTab === 'logs'}
      <button onclick={clearLogs} class="sl-clear">Clear</button>
    {/if}
  </div>

  {#if expanded}
    <!-- Content -->
    <div class="sl-content">
      {#if activeLogTab === 'logs'}
        {#if logs.length === 0}
          <div class="sl-empty">No log entries</div>
        {:else}
          {#each logs as entry}
            <div class="sl-row">
              <span class="sl-time">{formatTime(entry.timestamp)}</span>
              <span class="sl-badge" style="--cat-color: {getCategoryColor(entry.category)}">{getCategoryLabel(entry.category)}</span>
              <span class="sl-type">{entry.type}</span>
              <span class="sl-msg" class:sl-msg--error={!entry.success}>
                {#each formatLogMessage(entry.message) as seg}
                  {#if seg.type === 'code'}
                    <span class="sl-code">{seg.text}</span>
                  {:else if seg.type === 'url'}
                    <span class="sl-code">{seg.text}</span>
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
          <div class="sl-empty">Select a request to view history</div>
        {:else if histories.length === 0}
          <div class="sl-empty">No history for this request</div>
        {:else}
          {#each histories as h}
            <button
              onclick={() => selectedHistoryId = selectedHistoryId === h.id ? null : h.id}
              class="sl-history-row"
            >
              <span class="sl-time">{formatTime(h.executed_at)}</span>
              <span class="sl-history-method">{h.method}</span>
              <span class="sl-history-status" style:color={getStatusColor(h.status_code)}>{h.status_code || 'ERR'}</span>
              <span class="sl-history-url">{h.url}</span>
              <span class="sl-history-duration">{h.duration_ms ? `${h.duration_ms}ms` : '-'}</span>
            </button>
            {#if selectedHistoryId === h.id}
              <div class="sl-history-detail">
                <div class="sl-detail-label">Request Headers:</div>
                <pre class="sl-detail-pre">{h.request_headers ?? 'None'}</pre>
                {#if h.request_body}
                  <div class="sl-detail-label">Request Body:</div>
                  <pre class="sl-detail-pre sl-detail-pre--short">{h.request_body}</pre>
                {/if}
                <div class="sl-detail-label">Response Headers:</div>
                <pre class="sl-detail-pre">{h.response_headers ?? 'None'}</pre>
                <div class="sl-detail-label">Response Body:</div>
                <pre class="sl-detail-pre sl-detail-pre--tall">{h.response_body ?? 'None'}</pre>
              </div>
            {/if}
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .sl-root {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    background: var(--color-surface-900);
  }

  /* --- Drag handle --- */
  .sl-drag {
    height: 4px;
    flex-shrink: 0;
    cursor: ns-resize;
    border-top: 1px solid var(--border-default);
    transition: background 0.12s;
  }

  .sl-drag:hover {
    background: color-mix(in srgb, var(--color-brand-500) 20%, transparent);
  }

  .sl-drag:active {
    background: color-mix(in srgb, var(--color-brand-500) 30%, transparent);
  }

  .sl-drag-collapsed {
    height: 0;
    flex-shrink: 0;
    border-top: 1px solid var(--border-default);
  }

  /* --- Header --- */
  .sl-header {
    display: flex;
    align-items: center;
    height: 32px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-default);
    padding: 0 4px;
  }

  .sl-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 100%;
    border: none;
    background: transparent;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--color-surface-400);
    cursor: pointer;
    transition: color 0.12s;
  }

  .sl-tab:hover {
    color: var(--color-surface-200);
  }

  .sl-tab--active {
    color: var(--color-brand-400);
  }

  .sl-tab-chevron {
    width: 12px;
    height: 12px;
    transition: transform 0.15s;
  }

  .sl-tab-chevron--open {
    transform: rotate(180deg);
  }

  .sl-count {
    padding: 1px 6px;
    border-radius: var(--radius-full);
    background: var(--color-surface-700);
    font-size: 10px;
    font-weight: 500;
    color: var(--color-surface-300);
  }

  .sl-spacer {
    flex: 1;
  }

  .sl-clear {
    padding: 0 8px;
    border: none;
    background: transparent;
    font-size: 11px;
    color: var(--color-surface-500);
    cursor: pointer;
    transition: color 0.12s;
  }

  .sl-clear:hover {
    color: var(--color-surface-300);
  }

  /* --- Content --- */
  .sl-content {
    flex: 1;
    overflow: auto;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    font-size: 11px;
  }

  .sl-empty {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
    color: var(--color-surface-600);
  }

  /* --- Log rows --- */
  .sl-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border-muted);
    transition: background 0.1s;
  }

  .sl-row:hover {
    background: color-mix(in srgb, var(--color-surface-800) 50%, transparent);
  }

  .sl-time {
    flex-shrink: 0;
    width: 72px;
    color: var(--color-surface-600);
    font-variant-numeric: tabular-nums;
  }

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

  .sl-type {
    flex-shrink: 0;
    width: 64px;
    color: var(--color-surface-500);
  }

  .sl-msg {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-surface-300);
  }

  .sl-msg--error {
    color: var(--color-danger);
  }

  .sl-code {
    padding: 1px 5px;
    border-radius: var(--radius-xs);
    background: color-mix(in srgb, var(--color-surface-700) 50%, transparent);
    color: var(--color-brand-400);
    font-size: 10px;
  }

  /* --- History rows --- */
  .sl-history-row {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 12px;
    border: none;
    border-bottom: 1px solid var(--border-muted);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    font-size: 11px;
  }

  .sl-history-row:hover {
    background: color-mix(in srgb, var(--color-surface-800) 50%, transparent);
  }

  .sl-history-method {
    flex-shrink: 0;
    font-weight: 500;
    color: var(--color-surface-400);
  }

  .sl-history-status {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .sl-history-url {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-surface-400);
  }

  .sl-history-duration {
    flex-shrink: 0;
    color: var(--color-surface-600);
    font-variant-numeric: tabular-nums;
  }

  /* --- History detail --- */
  .sl-history-detail {
    border-bottom: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--color-surface-800) 30%, transparent);
    padding: 8px 12px;
    font-size: 10px;
  }

  .sl-detail-label {
    margin-bottom: 4px;
    color: var(--color-surface-500);
  }

  .sl-detail-pre {
    white-space: pre-wrap;
    color: var(--color-surface-400);
    margin-bottom: 8px;
  }

  .sl-detail-pre--short {
    max-height: 96px;
    overflow: auto;
  }

  .sl-detail-pre--tall {
    max-height: 128px;
    overflow: auto;
  }
</style>
