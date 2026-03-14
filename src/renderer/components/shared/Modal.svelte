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

  let backdropEl = $state<HTMLElement | null>(null)
  let modalEl = $state<HTMLElement | null>(null)

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

  onMount(() => {
    // Remember previously focused element to restore on close
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Portal to document.body so fixed positioning escapes any
    // ancestor backdrop-filter / transform containing blocks
    if (backdropEl) {
      document.body.appendChild(backdropEl)
    }

    // Autofocus first focusable element inside the modal
    requestAnimationFrame(() => {
      const first = modalEl?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    })

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onclose()
        return
      }

      // Focus trap: cycle Tab within the modal
      if (e.key === 'Tab' && modalEl) {
        const focusable = Array.from(modalEl.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      backdropEl?.remove()
      // Restore focus to the element that was focused before the modal opened
      previouslyFocused?.focus()
    }
  })
</script>

<!-- Backdrop (portaled to body) -->
<div bind:this={backdropEl} class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[modal-backdrop-in_0.2s_ease-out]" style="backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px)">
  <!-- eslint-disable-next-line svelte/valid-compile -->
  <button class="absolute inset-0" onclick={onclose} aria-label="Close"></button>

  <!-- Modal -->
  <div bind:this={modalEl} role="dialog" aria-modal="true" aria-label={title} class="relative z-10 w-full rounded-[20px] shadow-glass animate-[modal-content-in_0.25s_cubic-bezier(0.34,1.56,0.64,1)] {width}" style="background: var(--glass-bg-heavy); backdrop-filter: blur(var(--glass-blur-heavy)); -webkit-backdrop-filter: blur(var(--glass-blur-heavy)); border: 1px solid var(--glass-border); box-shadow: var(--shadow-glass)">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3" style="border-bottom: 1px solid var(--glass-border)">
      <h2 class="text-sm font-semibold text-surface-100">{title}</h2>
      <button
        onclick={onclose}
        aria-label="Close"
        class="flex h-6 w-6 items-center justify-center rounded-lg text-surface-400 transition-all duration-150 hover:bg-[var(--tint-active)] hover:text-surface-200"
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
