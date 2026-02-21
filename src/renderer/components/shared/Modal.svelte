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
<div class="modal-backdrop">
  <!-- eslint-disable-next-line svelte/valid-compile -->
  <button class="absolute inset-0" onclick={onclose} aria-label="Close"></button>

  <!-- Modal -->
  <div class="modal-content w-full {width}">
    <!-- Header -->
    <div class="modal-header">
      <h2 class="text-sm font-semibold text-surface-100">{title}</h2>
      <button
        onclick={onclose}
        aria-label="Close"
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

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    animation: modal-backdrop-in 0.15s ease-out;
  }

  .modal-content {
    position: relative;
    z-index: 10;
    border-radius: var(--radius-2xl);
    border: 1px solid var(--border-subtle);
    background: var(--color-surface-800);
    box-shadow: var(--shadow-xl);
    animation: modal-content-in 0.2s ease-out;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-subtle);
    padding: 12px 20px;
  }
</style>
