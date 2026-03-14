<script lang="ts">
  import { onMount } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import Modal from '../shared/Modal.svelte'
  import type { StoredCookie } from '../../../../shared/types/cookies'

  interface Props {
    onclose: () => void
  }

  let { onclose }: Props = $props()

  let cookies = $state<StoredCookie[]>([])

  let grouped = $derived.by(() => {
    const map = new SvelteMap<string, StoredCookie[]>()
    for (const cookie of cookies) {
      const domain = cookie.domain
      if (!map.has(domain)) map.set(domain, [])
      map.get(domain)!.push(cookie)
    }
    return map
  })

  let totalCount = $derived(cookies.length)

  function formatExpiry(expires?: number): string {
    if (!expires) return 'Session'
    return new Date(expires).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function truncateValue(value: string, max = 60): string {
    if (value.length <= max) return value
    return value.slice(0, max) + '...'
  }

  async function refresh(): Promise<void> {
    cookies = await window.api.cookies.list()
  }

  async function handleClearAll(): Promise<void> {
    await window.api.cookies.clear()
    cookies = []
  }

  async function handleDelete(domain: string, name: string): Promise<void> {
    await window.api.cookies.delete(domain, name)
    cookies = cookies.filter((c) => !(c.domain === domain && c.name === name))
  }

  onMount(() => {
    refresh()
  })
</script>

<Modal title="Cookie Jar" {onclose} width="max-w-xl">
  <!-- Header area -->
  <div class="mb-3 flex items-center justify-between">
    <span class="text-xs text-surface-400">
      {totalCount}
      {totalCount === 1 ? 'cookie' : 'cookies'}
    </span>
    {#if totalCount > 0}
      <button
        onclick={handleClearAll}
        class="text-xs text-danger-light hover:text-danger-lighter"
      >
        Clear All
      </button>
    {/if}
  </div>

  <!-- Cookie list -->
  {#if totalCount === 0}
    <div class="flex items-center justify-center py-10">
      <p class="text-center text-xs text-surface-500">
        No cookies stored. Cookies will be captured automatically from API responses.
      </p>
    </div>
  {:else}
    <div class="max-h-[400px] overflow-y-auto rounded border border-surface-700/50">
      {#each [...grouped] as [domain, domainCookies] (domain)}
        <!-- Domain header -->
        <div class="sticky top-0 px-3 py-2 bg-surface-800/80 text-xs font-medium text-surface-300">
          <span class="font-mono font-bold">{domain}</span>
          <span class="ml-2 text-surface-500">({domainCookies.length})</span>
        </div>

        <!-- Cookie rows -->
        {#each domainCookies as cookie (cookie.name + cookie.path)}
          <div class="group flex items-start gap-2 px-3 py-2 hover:bg-surface-700/30 border-b border-surface-700/50">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[11px] text-surface-200" style="font-feature-settings: var(--font-feature-mono)">
                  {cookie.name}
                </span>
              </div>
              <div class="mt-0.5 truncate font-mono text-[11px] text-surface-400" style="font-feature-settings: var(--font-feature-mono)">
                {truncateValue(cookie.value)}
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                {#if cookie.httpOnly}
                  <span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400">
                    HttpOnly
                  </span>
                {/if}
                {#if cookie.secure}
                  <span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400">
                    Secure
                  </span>
                {/if}
                {#if cookie.path !== '/'}
                  <span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400">
                    {cookie.path}
                  </span>
                {/if}
                <span class="text-[9px] text-surface-500">
                  {formatExpiry(cookie.expires)}
                </span>
              </div>
            </div>
            <button
              onclick={() => handleDelete(cookie.domain, cookie.name)}
              aria-label="Delete cookie {cookie.name}"
              class="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 text-surface-500 hover:text-danger-light transition-opacity"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</Modal>
