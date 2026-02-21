<script lang="ts">
  import type { ResponseCookie } from '../../lib/types'

  interface Props {
    cookies: ResponseCookie[]
  }

  let { cookies }: Props = $props()
</script>

<div class="flex flex-col gap-1.5 overflow-auto px-3 py-2.5">
  {#if cookies.length === 0}
    <p class="m-0 text-xs text-surface-500">No cookies in response.</p>
  {:else}
    {#each cookies as cookie}
      <div class="rounded-md border border-surface-700 bg-surface-800/50 px-2.5 py-2">
        <div class="flex items-baseline gap-2 font-mono text-xs" style="font-feature-settings: var(--font-feature-mono)">
          <span class="shrink-0 font-semibold text-brand-400">{cookie.name}</span>
          <span class="min-w-0 break-all text-surface-300">{cookie.value}</span>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          {#if cookie.domain}<span class="text-[10px] text-surface-500">Domain: {cookie.domain}</span>{/if}
          {#if cookie.path}<span class="text-[10px] text-surface-500">Path: {cookie.path}</span>{/if}
          {#if cookie.expires}<span class="text-[10px] text-surface-500">Expires: {cookie.expires}</span>{/if}
          {#if cookie.httpOnly}<span class="text-[10px] text-status-client-error">HttpOnly</span>{/if}
          {#if cookie.secure}<span class="text-[10px] text-success">Secure</span>{/if}
          {#if cookie.sameSite}<span class="text-[10px] text-surface-500">SameSite: {cookie.sameSite}</span>{/if}
        </div>
      </div>
    {/each}
  {/if}
</div>
