<script lang="ts">
  interface Props {
    headers: Record<string, string>
  }

  let { headers }: Props = $props()
</script>

<div class="flex flex-col gap-px overflow-auto px-3 py-2.5">
  {#each Object.entries(headers) as [key, value]}
    <div class="flex gap-2 rounded-sm px-2 py-1 transition-colors duration-100 hover:bg-surface-700/30">
      <span class="shrink-0 font-mono text-xs font-semibold text-brand-400" style="font-feature-settings: var(--font-feature-mono)">{key}</span>
      <span class="min-w-0 break-all font-mono text-xs text-surface-300" style="font-feature-settings: var(--font-feature-mono)">{value}</span>
    </div>
  {/each}
</div>
