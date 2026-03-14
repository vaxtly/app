<script lang="ts">
  import { onMount } from 'svelte'

  interface MenuItem {
    label: string
    action: () => void
    danger?: boolean
    separator?: boolean
    disabled?: boolean
    icon?: string
  }

  interface Props {
    x: number
    y: number
    items: MenuItem[]
    onclose: () => void
  }

  let { x, y, items, onclose }: Props = $props()

  let menuEl: HTMLDivElement

  function getMenuItems(): HTMLButtonElement[] {
    if (!menuEl) return []
    return Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'))
  }

  function focusItem(index: number): void {
    const enabledItems = getMenuItems()
    if (enabledItems.length === 0) return
    const clamped = Math.max(0, Math.min(index, enabledItems.length - 1))
    enabledItems[clamped].focus()
  }

  function handleKeydown(e: KeyboardEvent): void {
    const enabledItems = getMenuItems()
    if (enabledItems.length === 0) return

    const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement)

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = currentIndex < enabledItems.length - 1 ? currentIndex + 1 : 0
        enabledItems[next].focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = currentIndex > 0 ? currentIndex - 1 : enabledItems.length - 1
        enabledItems[prev].focus()
        break
      }
      case 'Home': {
        e.preventDefault()
        enabledItems[0].focus()
        break
      }
      case 'End': {
        e.preventDefault()
        enabledItems[enabledItems.length - 1].focus()
        break
      }
      case 'Escape':
        e.preventDefault()
        onclose()
        break
      case 'Tab':
        // Prevent tabbing out of the menu; close it instead
        e.preventDefault()
        onclose()
        break
    }
  }

  onMount(() => {
    // Adjust position if menu would go off-screen
    const rect = menuEl.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      menuEl.style.left = `${window.innerWidth - rect.width - 8}px`
    }
    if (rect.bottom > window.innerHeight) {
      menuEl.style.top = `${window.innerHeight - rect.height - 8}px`
    }

    // Focus the first non-disabled item on mount
    focusItem(0)

    function handleClick(e: MouseEvent): void {
      if (!menuEl.contains(e.target as Node)) {
        onclose()
      }
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('contextmenu', handleClick, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('contextmenu', handleClick, true)
    }
  })
</script>

<div
  bind:this={menuEl}
  role="menu"
  tabindex={-1}
  onkeydown={handleKeydown}
  class="fixed z-[100] min-w-[160px] overflow-hidden rounded-xl p-1 shadow-dropdown animate-[dropdown-in_0.15s_ease-out]"
  style="left: {x}px; top: {y}px; background: var(--glass-bg-heavy); backdrop-filter: blur(var(--glass-blur-heavy)); -webkit-backdrop-filter: blur(var(--glass-blur-heavy)); border: 1px solid var(--glass-border); box-shadow: var(--shadow-dropdown)"
>
  {#each items as item, i (i)}
    {#if item.separator}
      <div role="separator" class="my-1" style="border-top: 1px solid var(--glass-border)"></div>
    {:else}
      <button
        role="menuitem"
        tabindex={-1}
        onclick={() => { item.action(); onclose() }}
        disabled={item.disabled}
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-all duration-100
          {item.danger ? 'ctx-danger text-danger' : 'text-surface-200 hover:bg-[var(--tint-active)]'}
          {item.disabled ? 'cursor-not-allowed opacity-40' : ''}"
      >
        {#if item.icon}
          <svg class="h-3.5 w-3.5 shrink-0 {item.danger ? 'text-danger' : 'text-surface-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
          </svg>
        {/if}
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
