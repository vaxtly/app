<script lang="ts">
  import type { ResponseCookie } from '../../lib/types'

  interface Props {
    cookies: ResponseCookie[]
  }

  let { cookies }: Props = $props()
</script>

<div class="overflow-auto p-3">
  {#if cookies.length === 0}
    <p class="text-xs text-surface-500">No cookies in response.</p>
  {:else}
    <div class="space-y-2">
      {#each cookies as cookie}
        <div class="rounded border border-surface-700 p-2">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-semibold text-brand-400">{cookie.name}</span>
            <span class="font-mono text-xs text-surface-300">{cookie.value}</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-2 text-[10px] text-surface-500">
            {#if cookie.domain}<span>Domain: {cookie.domain}</span>{/if}
            {#if cookie.path}<span>Path: {cookie.path}</span>{/if}
            {#if cookie.expires}<span>Expires: {cookie.expires}</span>{/if}
            {#if cookie.httpOnly}<span class="text-orange-400">HttpOnly</span>{/if}
            {#if cookie.secure}<span class="text-green-400">Secure</span>{/if}
            {#if cookie.sameSite}<span>SameSite: {cookie.sameSite}</span>{/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
