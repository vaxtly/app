<script lang="ts">
  interface Props {
    headers: Record<string, string>
  }

  let { headers }: Props = $props()
</script>

<div class="rh-root">
  {#each Object.entries(headers) as [key, value]}
    <div class="rh-row">
      <span class="rh-key">{key}</span>
      <span class="rh-value">{value}</span>
    </div>
  {/each}
</div>

<style>
  .rh-root {
    overflow: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .rh-row {
    display: flex;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .rh-row:hover {
    background: color-mix(in srgb, var(--color-surface-700) 30%, transparent);
  }

  .rh-key {
    flex-shrink: 0;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-brand-400);
  }

  .rh-value {
    min-width: 0;
    word-break: break-all;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--color-surface-300);
  }
</style>
