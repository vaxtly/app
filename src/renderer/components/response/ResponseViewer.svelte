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

<div class="flex flex-col h-full">
  {#if !response && !loading}
    <!-- Empty state -->
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-surface-700/30 text-surface-600 mb-3">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p class="text-[13px] text-surface-400 mb-2">Send a request to see the response</p>
        <p class="rv-empty-hint flex items-center justify-center gap-1 text-[11px] text-surface-500">
          <kbd>Cmd</kbd> + <kbd>Enter</kbd>
        </p>
      </div>
    </div>

  {:else if loading}
    <!-- Loading state -->
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <div class="flex items-center justify-center gap-1.5 mb-3">
          <span class="rv-loader-dot"></span>
          <span class="rv-loader-dot"></span>
          <span class="rv-loader-dot"></span>
        </div>
        <p class="text-[13px] text-surface-400 mb-2">Sending request...</p>
      </div>
    </div>

  {:else if response}
    <!-- Status bar -->
    <div class="rv-status--{statusClass} flex items-center justify-between shrink-0 px-3 py-1.5 gap-3" style="border-bottom: 1px solid var(--glass-border); background: rgba(255, 255, 255, 0.02)">
      <div class="flex items-center gap-2 min-w-0">
        <span class="rv-status-led w-2 h-2 rounded-full shrink-0"></span>
        <span
          class="rv-status-code font-mono text-xs font-bold tracking-wide"
          style="font-feature-settings: var(--font-feature-mono)"
        >
          {response.status === 0 ? 'ERR' : response.status}
        </span>
        <span class="text-xs text-surface-300 whitespace-nowrap overflow-hidden text-ellipsis">{response.statusText}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="flex items-baseline gap-1">
          <span class="text-[9px] uppercase tracking-widest text-surface-500">TTFB</span>
          <span class="font-mono text-[11px] text-surface-300" style="font-feature-settings: var(--font-feature-mono)">{formatTime(response.timing.ttfb)}</span>
        </span>
        <span class="w-px h-2.5 bg-surface-700"></span>
        <span class="flex items-baseline gap-1">
          <span class="text-[9px] uppercase tracking-widest text-surface-500">Total</span>
          <span class="font-mono text-[11px] text-surface-300" style="font-feature-settings: var(--font-feature-mono)">{formatTime(response.timing.total)}</span>
        </span>
        <span class="w-px h-2.5 bg-surface-700"></span>
        <span class="flex items-baseline gap-1">
          <span class="text-[9px] uppercase tracking-widest text-surface-500">Size</span>
          <span class="font-mono text-[11px] text-surface-300" style="font-feature-settings: var(--font-feature-mono)">{formatSize(response.size)}</span>
        </span>
      </div>
    </div>

    <!-- Response tabs -->
    <div class="flex items-stretch shrink-0 h-9 px-1 gap-px" style="border-bottom: 1px solid var(--glass-border)">
      <button
        class="rv-tab flex items-center gap-[5px] px-2.5 my-1 border-none bg-transparent text-surface-400 text-xs font-medium cursor-pointer relative whitespace-nowrap rounded-lg transition-all duration-150 hover:text-surface-200 hover:bg-white/[0.04]"
        class:rv-tab--active={activeTab === 'body'}
        onclick={() => activeTab = 'body'}
      >
        Body
      </button>
      <button
        class="rv-tab flex items-center gap-[5px] px-2.5 my-1 border-none bg-transparent text-surface-400 text-xs font-medium cursor-pointer relative whitespace-nowrap rounded-lg transition-all duration-150 hover:text-surface-200 hover:bg-white/[0.04]"
        class:rv-tab--active={activeTab === 'headers'}
        onclick={() => activeTab = 'headers'}
      >
        Headers
        <span class="rv-tab-badge text-[10px] leading-none py-0.5 px-[5px] rounded-full bg-surface-600/60 text-surface-300 font-medium">{headerCount}</span>
      </button>
      {#if cookieCount > 0}
        <button
          class="rv-tab flex items-center gap-[5px] px-2.5 my-1 border-none bg-transparent text-surface-400 text-xs font-medium cursor-pointer relative whitespace-nowrap rounded-lg transition-all duration-150 hover:text-surface-200 hover:bg-white/[0.04]"
          class:rv-tab--active={activeTab === 'cookies'}
          onclick={() => activeTab = 'cookies'}
        >
          Cookies
          <span class="rv-tab-badge text-[10px] leading-none py-0.5 px-[5px] rounded-full bg-surface-600/60 text-surface-300 font-medium">{cookieCount}</span>
        </button>
      {/if}
      {#if isHtml}
        <button
          class="rv-tab flex items-center gap-[5px] px-2.5 my-1 border-none bg-transparent text-surface-400 text-xs font-medium cursor-pointer relative whitespace-nowrap rounded-lg transition-all duration-150 hover:text-surface-200 hover:bg-white/[0.04]"
          class:rv-tab--active={activeTab === 'preview'}
          onclick={() => activeTab = 'preview'}
        >
          Preview
        </button>
      {/if}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden">
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
  /* --- kbd styling (nested selector, can't do in Tailwind) --- */
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

  /* --- Loader dots animation --- */
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

  /* --- Status LED glow cascade --- */
  .rv-status--success .rv-status-led { background: var(--color-status-success); box-shadow: 0 0 8px color-mix(in srgb, var(--color-status-success) 40%, transparent), 0 0 2px color-mix(in srgb, var(--color-status-success) 60%, transparent); }
  .rv-status--redirect .rv-status-led { background: var(--color-status-redirect); box-shadow: 0 0 8px color-mix(in srgb, var(--color-status-redirect) 35%, transparent), 0 0 2px color-mix(in srgb, var(--color-status-redirect) 50%, transparent); }
  .rv-status--client-error .rv-status-led { background: var(--color-status-client-error); box-shadow: 0 0 8px color-mix(in srgb, var(--color-status-client-error) 40%, transparent), 0 0 2px color-mix(in srgb, var(--color-status-client-error) 60%, transparent); }
  .rv-status--server-error .rv-status-led { background: var(--color-danger-light); box-shadow: 0 0 8px color-mix(in srgb, var(--color-danger-light) 40%, transparent), 0 0 2px color-mix(in srgb, var(--color-danger-light) 60%, transparent); }
  .rv-status--error .rv-status-led { background: var(--color-danger-light); box-shadow: 0 0 8px color-mix(in srgb, var(--color-danger-light) 40%, transparent), 0 0 2px color-mix(in srgb, var(--color-danger-light) 60%, transparent); }

  /* --- Status code color cascade --- */
  .rv-status--success .rv-status-code { color: var(--color-status-success); }
  .rv-status--redirect .rv-status-code { color: var(--color-status-redirect); }
  .rv-status--client-error .rv-status-code { color: var(--color-status-client-error); }
  .rv-status--server-error .rv-status-code { color: var(--color-danger-light); }
  .rv-status--error .rv-status-code { color: var(--color-danger-light); }

  /* --- Active tab indicator (glass pill) --- */
  .rv-tab--active {
    color: var(--color-brand-400);
    background: rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .rv-tab--active:hover {
    color: var(--color-brand-400);
    background: rgba(255, 255, 255, 0.08);
  }

  /* --- Active tab badge color change --- */
  .rv-tab--active .rv-tab-badge {
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
    color: var(--color-brand-400);
  }
</style>
