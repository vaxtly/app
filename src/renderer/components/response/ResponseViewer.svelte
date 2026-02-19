<script lang="ts">
  import type { ResponseData } from '../../lib/types'
  import HtmlPreview from './HtmlPreview.svelte'
  import ResponseBody from './ResponseBody.svelte'
  import ResponseHeaders from './ResponseHeaders.svelte'
  import ResponseCookies from './ResponseCookies.svelte'
  import { getStatusColor, getStatusBgColor } from '../../lib/utils/http-colors'
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
</script>

<div class="flex h-full flex-col">
  {#if !response && !loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <svg class="mx-auto mb-3 h-10 w-10 text-surface-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p class="text-sm text-surface-500">Send a request to see the response</p>
        <p class="mt-1 text-xs text-surface-600">Cmd+Enter to send</p>
      </div>
    </div>

  {:else if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <svg class="mx-auto h-6 w-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <p class="mt-2 text-xs text-surface-400">Sending request...</p>
      </div>
    </div>

  {:else if response}
    <!-- Status bar -->
    <div class="flex shrink-0 items-center gap-3 border-b border-surface-700 px-3 py-1.5">
      <span class="rounded px-2 py-0.5 text-xs font-bold {getStatusBgColor(response.status)}">
        {response.status === 0 ? 'Error' : response.status} {response.statusText}
      </span>
      <div class="flex items-center gap-3 text-[10px] text-surface-400">
        <span>TTFB: {formatTime(response.timing.ttfb)}</span>
        <span>Total: {formatTime(response.timing.total)}</span>
        <span>{formatSize(response.size)}</span>
      </div>
    </div>

    <!-- Response tabs -->
    <div class="flex shrink-0 items-center gap-0.5 border-b border-surface-700 px-2">
      <button
        class="px-2.5 py-2 text-xs transition-colors {activeTab === 'body' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-surface-400 hover:text-surface-200'}"
        onclick={() => activeTab = 'body'}
      >
        Body
      </button>
      <button
        class="px-2.5 py-2 text-xs transition-colors {activeTab === 'headers' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-surface-400 hover:text-surface-200'}"
        onclick={() => activeTab = 'headers'}
      >
        Headers
        <span class="ml-1 rounded-full bg-surface-700 px-1.5 text-[10px] text-surface-300">{headerCount}</span>
      </button>
      {#if cookieCount > 0}
        <button
          class="px-2.5 py-2 text-xs transition-colors {activeTab === 'cookies' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-surface-400 hover:text-surface-200'}"
          onclick={() => activeTab = 'cookies'}
        >
          Cookies
          <span class="ml-1 rounded-full bg-surface-700 px-1.5 text-[10px] text-surface-300">{cookieCount}</span>
        </button>
      {/if}
      {#if isHtml}
        <button
          class="px-2.5 py-2 text-xs transition-colors {activeTab === 'preview' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-surface-400 hover:text-surface-200'}"
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
