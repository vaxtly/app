<script lang="ts">
  import type { ResponseCookie } from '../../lib/types'

  interface Props {
    cookies: ResponseCookie[]
  }

  let { cookies }: Props = $props()
</script>

<div class="rc-root">
  {#if cookies.length === 0}
    <p class="rc-empty">No cookies in response.</p>
  {:else}
    {#each cookies as cookie}
      <div class="rc-card">
        <div class="rc-header">
          <span class="rc-name">{cookie.name}</span>
          <span class="rc-value">{cookie.value}</span>
        </div>
        <div class="rc-meta">
          {#if cookie.domain}<span class="rc-tag">Domain: {cookie.domain}</span>{/if}
          {#if cookie.path}<span class="rc-tag">Path: {cookie.path}</span>{/if}
          {#if cookie.expires}<span class="rc-tag">Expires: {cookie.expires}</span>{/if}
          {#if cookie.httpOnly}<span class="rc-tag rc-tag--warn">HttpOnly</span>{/if}
          {#if cookie.secure}<span class="rc-tag rc-tag--ok">Secure</span>{/if}
          {#if cookie.sameSite}<span class="rc-tag">SameSite: {cookie.sameSite}</span>{/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .rc-root {
    overflow: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rc-empty {
    font-size: 12px;
    color: var(--color-surface-500);
    margin: 0;
  }

  .rc-card {
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--color-surface-700);
    background: color-mix(in srgb, var(--color-surface-800) 50%, transparent);
  }

  .rc-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
  }

  .rc-name {
    font-weight: 600;
    color: var(--color-brand-400);
    flex-shrink: 0;
  }

  .rc-value {
    color: var(--color-surface-300);
    min-width: 0;
    word-break: break-all;
  }

  .rc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .rc-tag {
    font-size: 10px;
    color: var(--color-surface-500);
  }

  .rc-tag--warn {
    color: #fb923c;
  }

  .rc-tag--ok {
    color: #4ade80;
  }
</style>
