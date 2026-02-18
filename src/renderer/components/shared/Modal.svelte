<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    onclose: () => void
    children: Snippet
    width?: string
  }

  let { title, onclose, children, width = 'max-w-lg' }: Props = $props()

  onMount(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onclose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
  <!-- eslint-disable-next-line svelte/valid-compile -->
  <button class="absolute inset-0" onclick={onclose} aria-label="Close"></button>

  <!-- Modal -->
  <div class="relative z-10 w-full {width} rounded-xl border border-surface-700 bg-surface-800 shadow-2xl">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 px-5 py-3">
      <h2 class="text-sm font-semibold text-surface-100">{title}</h2>
      <button
        onclick={onclose}
        class="flex h-6 w-6 items-center justify-center rounded text-surface-400 hover:bg-surface-700 hover:text-surface-200"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Body -->
    <div class="p-5">
      {@render children()}
    </div>
  </div>
</div>
