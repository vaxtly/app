<script lang="ts">
  import type { SSEEvent } from '../../lib/types'
  import { formatTime } from '../../lib/utils/formatters'
  import { onMount } from 'svelte'

  interface Props {
    events?: SSEEvent[]
    streaming: boolean
  }

  let { events, streaming }: Props = $props()

  let container = $state<HTMLElement | null>(null)
  let userScrolled = $state(false)

  function truncate(str: string, max = 200): string {
    if (str.length <= max) return str
    return str.slice(0, max) + '...'
  }

  // Auto-scroll to bottom when new events arrive (unless user scrolled up)
  $effect(() => {
    if (!container || !events?.length) return
    void events.length // track dependency
    if (!userScrolled) {
      container.scrollTop = container.scrollHeight
    }
  })

  function handleScroll(): void {
    if (!container) return
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40
    userScrolled = !atBottom
  }

  // Reset scroll lock when streaming starts
  $effect(() => {
    if (streaming) userScrolled = false
  })
</script>

<div
  class="flex flex-col h-full overflow-auto"
  bind:this={container}
  onscroll={handleScroll}
>
  {#if !events?.length}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-[13px] text-surface-500">
        {#if streaming}
          Waiting for events...
        {:else}
          No events received
        {/if}
      </p>
    </div>
  {:else}
    <table class="w-full text-xs border-collapse">
      <thead class="sticky top-0 z-10" style="background: var(--color-surface-800)">
        <tr style="border-bottom: 1px solid var(--glass-border)">
          <th class="px-3 py-1.5 text-left font-medium text-surface-500 w-10">#</th>
          <th class="px-3 py-1.5 text-left font-medium text-surface-500 w-20">Time</th>
          <th class="px-3 py-1.5 text-left font-medium text-surface-500 w-28">Type</th>
          <th class="px-3 py-1.5 text-left font-medium text-surface-500">Data</th>
        </tr>
      </thead>
      <tbody>
        {#each events as event, i (i)}
          <tr class="transition-colors duration-100 hover:bg-surface-700/30" style="border-bottom: 1px solid var(--glass-border)">
            <td class="px-3 py-1.5 font-mono text-surface-500" style="font-feature-settings: var(--font-feature-mono)">{i + 1}</td>
            <td class="px-3 py-1.5 font-mono text-surface-400" style="font-feature-settings: var(--font-feature-mono)">{formatTime(event.timestamp)}</td>
            <td class="px-3 py-1.5">
              <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium {event.event === 'message' ? 'bg-brand-500/10 text-brand-400' : 'bg-amber-500/10 text-amber-400'}">
                {event.event}
              </span>
            </td>
            <td class="px-3 py-1.5 font-mono text-surface-300 break-all" style="font-feature-settings: var(--font-feature-mono)">{truncate(event.data)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
