<script lang="ts">
  interface Props {
    headers: Record<string, string>
  }

  let { headers }: Props = $props()
</script>

<div class="overflow-auto p-3">
  <div class="space-y-0.5 font-mono text-xs">
    {#each Object.entries(headers) as [key, value]}
      <div class="flex gap-2 rounded px-2 py-1 hover:bg-surface-800/50">
        <span class="shrink-0 font-semibold text-brand-400">{key}</span>
        <span class="min-w-0 break-all text-surface-300">{value}</span>
      </div>
    {/each}
  </div>
</div>
