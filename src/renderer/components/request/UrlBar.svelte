<script lang="ts">
  import { HTTP_METHODS } from '../../../shared/constants'
  import { METHOD_COLORS } from '../../lib/utils/http-colors'

  interface Props {
    method: string
    url: string
    loading: boolean
    onmethodchange: (method: string) => void
    onurlchange: (url: string) => void
    onsend: () => void
    oncancel: () => void
  }

  let { method, url, loading, onmethodchange, onurlchange, onsend, oncancel }: Props = $props()

  let urlInput: HTMLInputElement

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      onsend()
    }
  }

  export function focus(): void {
    urlInput?.focus()
  }
</script>

<div class="flex items-center gap-2">
  <select
    value={method}
    onchange={(e) => onmethodchange(e.currentTarget.value)}
    class="h-9 cursor-pointer rounded-lg border border-surface-600 bg-surface-800 px-2.5 pr-7 text-xs font-bold {METHOD_COLORS[method] ?? 'text-surface-100'} focus:border-brand-500 focus:outline-none"
  >
    {#each HTTP_METHODS as m}
      <option value={m} class="bg-surface-800 {METHOD_COLORS[m]}">{m}</option>
    {/each}
  </select>

  <input
    bind:this={urlInput}
    type="text"
    value={url}
    oninput={(e) => onurlchange(e.currentTarget.value)}
    onkeydown={handleKeydown}
    placeholder="Enter URL..."
    class="h-9 flex-1 rounded-lg border border-surface-600 bg-surface-800 px-3 text-sm text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
  />

  {#if loading}
    <button
      onclick={oncancel}
      class="h-9 rounded-lg bg-red-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
    >
      Cancel
    </button>
  {:else}
    <button
      onclick={onsend}
      disabled={!url.trim()}
      class="h-9 rounded-lg bg-brand-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Send
    </button>
  {/if}
</div>
