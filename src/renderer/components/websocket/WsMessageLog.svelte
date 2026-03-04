<script lang="ts">
  import CodeEditor from '../CodeEditor.svelte'
  import type { WsMessage } from '../../lib/types'

  interface Props {
    messages: WsMessage[]
    onclear: () => void
  }

  let { messages, onclear }: Props = $props()

  let scrollEl = $state<HTMLElement | null>(null)
  let autoScroll = $state(true)
  let expandedId = $state<string | null>(null)

  // Auto-scroll to bottom on new messages
  $effect(() => {
    if (messages.length && autoScroll && scrollEl) {
      requestAnimationFrame(() => {
        scrollEl?.scrollTo({ top: scrollEl.scrollHeight })
      })
    }
  })

  function handleScroll(): void {
    if (!scrollEl) return
    const { scrollTop, scrollHeight, clientHeight } = scrollEl
    autoScroll = scrollHeight - scrollTop - clientHeight < 40
  }

  function toggleExpanded(id: string): void {
    expandedId = expandedId === id ? null : id
  }

  function formatTime(timestamp: string): string {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function tryFormatJson(data: string): { formatted: string; isJson: boolean } {
    try {
      const parsed = JSON.parse(data)
      return { formatted: JSON.stringify(parsed, null, 2), isJson: true }
    } catch {
      return { formatted: data, isJson: false }
    }
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-1.5" style="border-bottom: 1px solid var(--glass-border)">
    <span class="text-xs font-medium text-surface-400">
      Messages
      {#if messages.length > 0}
        <span class="text-surface-500">({messages.length})</span>
      {/if}
    </span>
    {#if messages.length > 0}
      <button
        onclick={onclear}
        class="rounded px-1.5 py-0.5 text-[10px] font-medium text-surface-500 transition-colors hover:bg-[var(--tint-hover)] hover:text-surface-300"
      >
        Clear
      </button>
    {/if}
  </div>

  <!-- Message list -->
  <div bind:this={scrollEl} onscroll={handleScroll} class="flex-1 overflow-y-auto">
    {#if messages.length === 0}
      <div class="flex h-full items-center justify-center text-xs text-surface-600">
        No messages yet
      </div>
    {:else}
      <div class="divide-y" style="--tw-divide-color: var(--glass-border)">
        {#each messages as msg (msg.id)}
          {@const isSent = msg.direction === 'sent'}
          {@const preview = tryFormatJson(msg.data)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="group cursor-pointer px-3 py-1.5 transition-colors hover:bg-[var(--tint-faint)]"
            onclick={() => toggleExpanded(msg.id)}
            onkeydown={(e) => { if (e.key === 'Enter') toggleExpanded(msg.id) }}
          >
            <div class="flex items-start gap-2">
              <!-- Direction arrow -->
              <span class="mt-0.5 shrink-0 font-mono text-[10px] font-bold" style:color={isSent ? 'var(--color-method-ws)' : 'var(--color-brand-400)'}>
                {isSent ? '\u2191' : '\u2193'}
              </span>

              <!-- Data preview -->
              <span class="min-w-0 flex-1 truncate font-mono text-sm {isSent ? 'text-surface-200' : 'text-surface-300'}">
                {msg.data.slice(0, 200)}
              </span>

              <!-- Meta -->
              <div class="flex shrink-0 items-center gap-2">
                <span class="text-[10px] text-surface-600">{formatSize(msg.size)}</span>
                <span class="font-mono text-[10px] text-surface-500">{formatTime(msg.timestamp)}</span>
              </div>
            </div>

            <!-- Expanded view -->
            {#if expandedId === msg.id}
              {#if preview.isJson}
                <div class="mt-2 max-h-[300px] overflow-hidden rounded-lg" onclick={(e) => e.stopPropagation()}>
                  <CodeEditor value={preview.formatted} language="json" readonly />
                </div>
              {:else}
                <pre class="mt-2 max-h-[300px] overflow-auto rounded-lg p-2.5 font-mono text-sm text-surface-200" style="background: var(--tint-subtle); white-space: pre-wrap; word-break: break-all">{preview.formatted}</pre>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Auto-scroll indicator -->
  {#if !autoScroll && messages.length > 0}
    <button
      onclick={() => { autoScroll = true; scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' }) }}
      class="absolute bottom-2 right-2 rounded-full px-2 py-1 text-[10px] text-surface-300 shadow-md transition-colors hover:text-surface-100"
      style="background: var(--glass-bg-heavy); border: 1px solid var(--glass-border)"
    >
      Scroll to bottom
    </button>
  {/if}
</div>
