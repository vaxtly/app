<script lang="ts">
  import type { ResponseData } from '../../lib/types'
  import HtmlPreview from './HtmlPreview.svelte'
  import ResponseBody from './ResponseBody.svelte'
  import ResponseHeaders from './ResponseHeaders.svelte'
  import ResponseCookies from './ResponseCookies.svelte'

  import { formatSize, formatTime } from '../../lib/utils/formatters'

  interface Props {
    response: ResponseData | null
    loading: boolean
  }

  let { response, loading }: Props = $props()

  let activeTab = $state<'body' | 'headers' | 'cookies' | 'preview'>('body')

  let headerCount = $derived(response ? Object.keys(response.headers).length : 0)
  let cookieCount = $derived(response?.cookies?.length ?? 0)
  let isHtml = $derived.by(() => {
    if (!response) return false
    const ct = response.headers['content-type'] ?? response.headers['Content-Type'] ?? ''
    return ct.includes('text/html')
  })

  // Status classification for styling
  let statusClass = $derived.by(() => {
    if (!response) return ''
    const s = response.status
    if (s >= 200 && s < 300) return 'success'
    if (s >= 300 && s < 400) return 'redirect'
    if (s >= 400 && s < 500) return 'client-error'
    if (s >= 500) return 'server-error'
    return 'error'
  })
</script>

<div class="rv-root">
  {#if !response && !loading}
    <!-- Empty state -->
    <div class="rv-empty">
      <div class="rv-empty-inner">
        <div class="rv-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p class="rv-empty-title">Send a request to see the response</p>
        <p class="rv-empty-hint">
          <kbd>Cmd</kbd> + <kbd>Enter</kbd>
        </p>
      </div>
    </div>

  {:else if loading}
    <!-- Loading state -->
    <div class="rv-empty">
      <div class="rv-empty-inner">
        <div class="rv-loader">
          <span class="rv-loader-dot"></span>
          <span class="rv-loader-dot"></span>
          <span class="rv-loader-dot"></span>
        </div>
        <p class="rv-empty-title">Sending request...</p>
      </div>
    </div>

  {:else if response}
    <!-- Status bar -->
    <div class="rv-status rv-status--{statusClass}">
      <div class="rv-status-left">
        <span class="rv-status-led"></span>
        <span class="rv-status-code">
          {response.status === 0 ? 'ERR' : response.status}
        </span>
        <span class="rv-status-text">{response.statusText}</span>
      </div>
      <div class="rv-status-metrics">
        <span class="rv-metric">
          <span class="rv-metric-label">TTFB</span>
          <span class="rv-metric-value">{formatTime(response.timing.ttfb)}</span>
        </span>
        <span class="rv-metric-sep"></span>
        <span class="rv-metric">
          <span class="rv-metric-label">Total</span>
          <span class="rv-metric-value">{formatTime(response.timing.total)}</span>
        </span>
        <span class="rv-metric-sep"></span>
        <span class="rv-metric">
          <span class="rv-metric-label">Size</span>
          <span class="rv-metric-value">{formatSize(response.size)}</span>
        </span>
      </div>
    </div>

    <!-- Response tabs -->
    <div class="rv-tabs">
      <button
        class="rv-tab"
        class:rv-tab--active={activeTab === 'body'}
        onclick={() => activeTab = 'body'}
      >
        Body
      </button>
      <button
        class="rv-tab"
        class:rv-tab--active={activeTab === 'headers'}
        onclick={() => activeTab = 'headers'}
      >
        Headers
        <span class="rv-tab-badge">{headerCount}</span>
      </button>
      {#if cookieCount > 0}
        <button
          class="rv-tab"
          class:rv-tab--active={activeTab === 'cookies'}
          onclick={() => activeTab = 'cookies'}
        >
          Cookies
          <span class="rv-tab-badge">{cookieCount}</span>
        </button>
      {/if}
      {#if isHtml}
        <button
          class="rv-tab"
          class:rv-tab--active={activeTab === 'preview'}
          onclick={() => activeTab = 'preview'}
        >
          Preview
        </button>
      {/if}
    </div>

    <!-- Content -->
    <div class="rv-content">
      {#if activeTab === 'body'}
        <ResponseBody body={response.body} headers={response.headers} />
      {:else if activeTab === 'headers'}
        <ResponseHeaders headers={response.headers} />
      {:else if activeTab === 'cookies'}
        <ResponseCookies cookies={response.cookies ?? []} />
      {:else if activeTab === 'preview'}
        <HtmlPreview body={response.body} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .rv-root {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* --- Empty / Loading state --- */
  .rv-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .rv-empty-inner {
    text-align: center;
  }

  .rv-empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-surface-700) 30%, transparent);
    color: var(--color-surface-600);
    margin-bottom: 12px;
  }

  .rv-empty-title {
    font-size: 13px;
    color: var(--color-surface-400);
    margin: 0 0 8px;
  }

  .rv-empty-hint {
    font-size: 11px;
    color: var(--color-surface-500);
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .rv-empty-hint kbd {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--color-surface-700) 60%, transparent);
    border: 1px solid var(--color-surface-600);
    font-size: 10px;
    font-family: inherit;
    color: var(--color-surface-300);
    line-height: 1.4;
  }

  /* --- Loader dots --- */
  .rv-loader {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 12px;
  }

  .rv-loader-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-brand-400);
    animation: rv-bounce 1.2s ease-in-out infinite;
  }

  .rv-loader-dot:nth-child(2) { animation-delay: 0.15s; }
  .rv-loader-dot:nth-child(3) { animation-delay: 0.3s; }

  @keyframes rv-bounce {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.1); }
  }

  /* --- Status bar --- */
  .rv-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding: 6px 12px;
    border-bottom: 1px solid var(--color-surface-700);
    gap: 12px;
  }

  .rv-status-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .rv-status-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .rv-status--success .rv-status-led { background: var(--color-status-success); box-shadow: 0 0 6px color-mix(in srgb, var(--color-status-success) 50%, transparent); }
  .rv-status--redirect .rv-status-led { background: var(--color-status-redirect); box-shadow: 0 0 6px color-mix(in srgb, var(--color-status-redirect) 40%, transparent); }
  .rv-status--client-error .rv-status-led { background: var(--color-status-client-error); box-shadow: 0 0 6px color-mix(in srgb, var(--color-status-client-error) 50%, transparent); }
  .rv-status--server-error .rv-status-led { background: var(--color-danger-light); box-shadow: 0 0 6px color-mix(in srgb, var(--color-danger-light) 50%, transparent); }
  .rv-status--error .rv-status-led { background: var(--color-danger-light); box-shadow: 0 0 6px color-mix(in srgb, var(--color-danger-light) 50%, transparent); }

  .rv-status-code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .rv-status--success .rv-status-code { color: var(--color-status-success); }
  .rv-status--redirect .rv-status-code { color: var(--color-status-redirect); }
  .rv-status--client-error .rv-status-code { color: var(--color-status-client-error); }
  .rv-status--server-error .rv-status-code { color: var(--color-danger-light); }
  .rv-status--error .rv-status-code { color: var(--color-danger-light); }

  .rv-status-text {
    font-size: 12px;
    color: var(--color-surface-300);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* --- Metrics --- */
  .rv-status-metrics {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .rv-metric {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .rv-metric-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-surface-500);
  }

  .rv-metric-value {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    color: var(--color-surface-300);
  }

  .rv-metric-sep {
    width: 1px;
    height: 10px;
    background: var(--color-surface-700);
  }

  /* --- Response tabs --- */
  .rv-tabs {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: 36px;
    border-bottom: 1px solid var(--color-surface-700);
    padding: 0 4px;
    gap: 1px;
  }

  .rv-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border: none;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    position: relative;
    transition: color 0.12s, background 0.12s;
    white-space: nowrap;
  }

  .rv-tab:hover {
    color: var(--color-surface-200);
    background: color-mix(in srgb, var(--color-surface-700) 30%, transparent);
  }

  .rv-tab--active {
    color: var(--color-brand-400);
  }

  .rv-tab--active:hover {
    color: var(--color-brand-400);
  }

  .rv-tab--active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 6px;
    right: 6px;
    height: 2px;
    background: var(--color-brand-500);
    border-radius: 1px 1px 0 0;
  }

  .rv-tab-badge {
    font-size: 10px;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--color-surface-600) 60%, transparent);
    color: var(--color-surface-300);
    font-weight: 500;
  }

  .rv-tab--active .rv-tab-badge {
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
    color: var(--color-brand-400);
  }

  /* --- Content --- */
  .rv-content {
    flex: 1;
    overflow: hidden;
  }
</style>
