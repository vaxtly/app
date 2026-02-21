<script lang="ts">
  import { onMount } from 'svelte'

  interface MenuItem {
    label: string
    action: () => void
    danger?: boolean
    separator?: boolean
    disabled?: boolean
  }

  interface Props {
    x: number
    y: number
    items: MenuItem[]
    onclose: () => void
  }

  let { x, y, items, onclose }: Props = $props()

  let menuEl: HTMLDivElement

  onMount(() => {
    // Adjust position if menu would go off-screen
    const rect = menuEl.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      menuEl.style.left = `${window.innerWidth - rect.width - 8}px`
    }
    if (rect.bottom > window.innerHeight) {
      menuEl.style.top = `${window.innerHeight - rect.height - 8}px`
    }

    function handleClick(e: MouseEvent): void {
      if (!menuEl.contains(e.target as Node)) {
        onclose()
      }
    }

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onclose()
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('contextmenu', handleClick, true)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('contextmenu', handleClick, true)
      document.removeEventListener('keydown', handleKey)
    }
  })
</script>

<div
  bind:this={menuEl}
  class="fixed z-[100] min-w-[160px] overflow-hidden rounded-xl p-1 shadow-dropdown animate-[dropdown-in_0.15s_ease-out]"
  style="left: {x}px; top: {y}px; background: var(--glass-bg-heavy); backdrop-filter: blur(var(--glass-blur-heavy)); -webkit-backdrop-filter: blur(var(--glass-blur-heavy)); border: 1px solid var(--glass-border); box-shadow: var(--shadow-dropdown)"
>
  {#each items as item}
    {#if item.separator}
      <div class="my-1" style="border-top: 1px solid var(--glass-border)"></div>
    {:else}
      <button
        onclick={() => { item.action(); onclose() }}
        disabled={item.disabled}
        class="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs transition-all duration-100
          {item.danger ? 'ctx-danger text-danger' : 'text-surface-200 hover:bg-[var(--tint-active)]'}
          {item.disabled ? 'cursor-not-allowed opacity-40' : ''}"
      >
        {item.label}
      </button>
    {/if}
  {/each}
</div>

<style>
  .ctx-danger:hover {
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  }
</style>
