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
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[modal-backdrop-in_0.2s_ease-out]" style="backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px)">
  <!-- eslint-disable-next-line svelte/valid-compile -->
  <button class="absolute inset-0" onclick={onclose} aria-label="Close"></button>

  <!-- Modal -->
  <div class="relative z-10 w-full rounded-[20px] shadow-glass animate-[modal-content-in_0.25s_cubic-bezier(0.34,1.56,0.64,1)] {width}" style="background: var(--glass-bg-heavy); backdrop-filter: blur(var(--glass-blur-heavy)); -webkit-backdrop-filter: blur(var(--glass-blur-heavy)); border: 1px solid var(--glass-border); box-shadow: var(--shadow-glass)">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3" style="border-bottom: 1px solid var(--glass-border)">
      <h2 class="text-sm font-semibold text-surface-100">{title}</h2>
      <button
        onclick={onclose}
        aria-label="Close"
        class="flex h-6 w-6 items-center justify-center rounded-lg text-surface-400 transition-all duration-150 hover:bg-white/[0.08] hover:text-surface-200"
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
