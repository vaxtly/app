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
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKey)
    }
  })
</script>

<div
  bind:this={menuEl}
  class="ctx-menu fixed z-[100] min-w-[160px] border bg-surface-800 overflow-hidden"
  style="left: {x}px; top: {y}px"
>
  {#each items as item}
    {#if item.separator}
      <div class="my-1 border-t border-surface-700"></div>
    {:else}
      <button
        onclick={() => { item.action(); onclose() }}
        disabled={item.disabled}
        class="flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors
          {item.danger ? 'ctx-danger' : 'text-surface-200 hover:bg-surface-700'}
          {item.disabled ? 'cursor-not-allowed opacity-40' : ''}"
      >
        {item.label}
      </button>
    {/if}
  {/each}
</div>

<style>
  .ctx-menu {
    border-radius: var(--radius-2xl);
    border-color: var(--border-dropdown);
    box-shadow: var(--shadow-dropdown);
    animation: dropdown-in 0.12s ease-out;
  }

  @keyframes dropdown-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .ctx-danger {
    color: var(--color-danger);
  }
  .ctx-danger:hover {
    background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  }
</style>
