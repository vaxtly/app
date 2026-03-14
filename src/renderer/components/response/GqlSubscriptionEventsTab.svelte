<script lang="ts">
  interface GqlSubscriptionEvent {
    id: string
    type: 'data' | 'error' | 'complete'
    data: string
    timestamp: number
  }

  interface Props {
    events: GqlSubscriptionEvent[]
    connected: boolean
  }

  let { events, connected }: Props = $props()

  let container = $state<HTMLElement | null>(null)
  let userScrolled = $state(false)

  function formatRelativeTime(timestamp: number, firstTimestamp: number): string {
    const diff = timestamp - firstTimestamp
    if (diff < 1000) return `+${diff}ms`
    return `+${(diff / 1000).toFixed(1)}s`
  }

  function formatEventData(data: string): string {
    try {
      return JSON.stringify(JSON.parse(data), null, 2)
    } catch {
      return data
    }
  }

  let firstTimestamp = $derived(events.length > 0 ? events[0].timestamp : 0)

  // Auto-scroll to bottom when new events arrive (unless user scrolled up)
  $effect(() => {
    if (!container || !events.length) return
    void events.length
    if (!userScrolled) {
      container.scrollTop = container.scrollHeight
    }
  })

  function handleScroll(): void {
    if (!container) return
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40
    userScrolled = !atBottom
  }

  // Reset scroll lock when connection starts
  $effect(() => {
    if (connected) userScrolled = false
  })
</script>

<div class="flex flex-col h-full">
  <!-- Header bar -->
  <div class="px-3 py-2 flex items-center gap-2 border-b border-surface-700 shrink-0">
    {#if connected}
      <span class="sse-pulse relative flex h-2 w-2">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
      </span>
      <span class="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Subscribed</span>
    {:else}
      <span class="relative flex h-2 w-2">
        <span class="relative inline-flex h-2 w-2 rounded-full bg-surface-500"></span>
      </span>
      <span class="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">Disconnected</span>
    {/if}
    <span class="text-[11px] text-surface-500">{events.length} event{events.length !== 1 ? 's' : ''}</span>
  </div>

  <!-- Event list -->
  <div
    class="flex-1 overflow-y-auto"
    bind:this={container}
    onscroll={handleScroll}
  >
    {#if !events.length}
      <div class="flex flex-1 h-full items-center justify-center">
        <p class="text-[13px] text-surface-500">
          {#if connected}
            Waiting for subscription events...
          {:else}
            No events received
          {/if}
        </p>
      </div>
    {:else}
      {#each events as event (event.id)}
        <div class="px-3 py-2 border-b border-surface-700/50">
          <div class="flex items-center gap-2">
            {#if event.type === 'data'}
              <span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400">Data</span>
            {:else if event.type === 'error'}
              <span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-red-500/10 text-red-400">Error</span>
            {:else}
              <span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-surface-600/50 text-surface-400">Complete</span>
            {/if}
            <span class="font-mono text-[10px] text-surface-500" style="font-feature-settings: var(--font-feature-mono)">
              {formatRelativeTime(event.timestamp, firstTimestamp)}
            </span>
          </div>
          <pre
            class="mt-1.5 p-2 rounded bg-surface-800 font-mono text-[11px] text-surface-200 overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto"
            style="font-feature-settings: var(--font-feature-mono)"
          >{formatEventData(event.data)}</pre>
        </div>
      {/each}
    {/if}
  </div>
</div>
