<script lang="ts">
  import { onMount } from 'svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { getMethodColor } from '../../lib/utils/http-colors'
  import ContextMenu from '../shared/ContextMenu.svelte'
  import EnvironmentSelector from './EnvironmentSelector.svelte'
  import type { Tab } from '../../lib/stores/app.svelte'

  const isMac = window.navigator.userAgent.includes('Macintosh')

  let contextMenu = $state<{ x: number; y: number; tabId: string } | null>(null)
  let scrollEl = $state<HTMLElement | null>(null)

  // Drag-and-drop reorder state (pointer events)
  let dragIndex = $state<number | null>(null)
  let dropIndex = $state<number | null>(null)
  let isDragging = $state(false)
  let dragStartX = 0
  let dragCurrentX = $state(0)
  let dragTabWidth = 0
  let tabRects: DOMRect[] = []
  let dragJustEnded = false

  const DRAG_THRESHOLD = 4

  // JS-based window dragging on empty tab bar space (macOS)
  let winDragStart: { screenX: number; screenY: number } | null = null

  function handleBarMouseDown(e: MouseEvent): void {
    if (!isMac) return
    if ((e.target as HTMLElement).closest('[role="tab"]')) return
    if (e.button !== 0) return
    winDragStart = { screenX: e.screenX, screenY: e.screenY }
    window.api.window.dragStart()
    window.addEventListener('mousemove', handleBarMouseMove)
    window.addEventListener('mouseup', handleBarMouseUp)
  }

  function handleBarMouseMove(e: MouseEvent): void {
    if (!winDragStart) return
    window.api.window.dragMove(e.screenX - winDragStart.screenX, e.screenY - winDragStart.screenY)
  }

  function handleBarMouseUp(): void {
    winDragStart = null
    window.removeEventListener('mousemove', handleBarMouseMove)
    window.removeEventListener('mouseup', handleBarMouseUp)
  }

  // Clean up window-level listeners if component is destroyed mid-drag
  onMount(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('mousemove', handleBarMouseMove)
      window.removeEventListener('mouseup', handleBarMouseUp)
    }
  })

  function handlePointerDown(e: PointerEvent, index: number): void {
    if (e.button !== 0) return
    dragIndex = index
    dragStartX = e.clientX
    dragCurrentX = e.clientX

    if (scrollEl) {
      const tabs = scrollEl.querySelectorAll<HTMLElement>('[role="tab"]')
      tabRects = Array.from(tabs).map((t) => t.getBoundingClientRect())
      dragTabWidth = tabRects[index]?.width ?? 0
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  function handlePointerMove(e: PointerEvent): void {
    if (dragIndex === null) return
    dragCurrentX = e.clientX

    if (!isDragging && Math.abs(dragCurrentX - dragStartX) > DRAG_THRESHOLD) {
      isDragging = true
    }
    if (!isDragging) return

    // Calculate drop index from pointer position vs cached tab midpoints
    let newDrop = tabRects.length
    for (let i = 0; i < tabRects.length; i++) {
      if (e.clientX < tabRects[i].left + tabRects[i].width / 2) {
        newDrop = i
        break
      }
    }
    dropIndex = newDrop
  }

  function handlePointerUp(): void {
    if (isDragging && dragIndex !== null && dropIndex !== null) {
      appStore.reorderTabs(dragIndex, dropIndex)
      dragJustEnded = true
      requestAnimationFrame(() => { dragJustEnded = false })
    }

    dragIndex = null
    dropIndex = null
    isDragging = false
    dragTabWidth = 0
    tabRects = []

    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }

  function getTabTransform(i: number): string {
    if (!isDragging || dragIndex === null || dropIndex === null) return 'none'

    // The dragged tab follows the cursor
    if (i === dragIndex) return `translateX(${dragCurrentX - dragStartX}px)`

    // Other tabs shift to open a gap at dropIndex
    if (dropIndex > dragIndex + 1) {
      // Dragging right: tabs between source+1 and dest-1 shift left
      if (i > dragIndex && i < dropIndex) return `translateX(${-dragTabWidth}px)`
    } else if (dropIndex < dragIndex) {
      // Dragging left: tabs between dest and source-1 shift right
      if (i >= dropIndex && i < dragIndex) return `translateX(${dragTabWidth}px)`
    }
    return 'none'
  }

  function handleWheel(e: WheelEvent): void {
    if (!scrollEl) return
    if (e.deltaY !== 0) {
      e.preventDefault()
      scrollEl.scrollLeft += e.deltaY
    }
  }

  function handleTabClick(tabId: string): void {
    if (dragJustEnded) return
    appStore.setActiveTab(tabId)
  }

  function handleTabClose(e: MouseEvent, tabId: string): void {
    e.stopPropagation()
    appStore.closeTab(tabId)
  }

  function handleTabMiddleClick(e: MouseEvent, tabId: string): void {
    if (e.button === 1) {
      e.preventDefault()
      appStore.closeTab(tabId)
    }
  }

  function handleTabContextMenu(e: MouseEvent, tabId: string): void {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY, tabId }
  }

  function handleBarDblClick(e: MouseEvent): void {
    // Only fire when double-clicking empty space, not on a tab
    if ((e.target as HTMLElement).closest('[role="tab"]')) return
    appStore.openDraftTab()
  }

  function getContextMenuItems(tabId: string) {
    const tab = appStore.openTabs.find((t) => t.id === tabId)
    if (!tab) return []
    return [
      { label: tab.pinned ? 'Unpin' : 'Pin', action: () => appStore.togglePinTab(tabId) },
      { label: 'Close', action: () => appStore.closeTab(tabId), disabled: tab.pinned },
      { label: 'Close Others', action: () => appStore.closeOtherTabs(tabId) },
      { label: 'Close All', action: () => appStore.closeAllTabs() },
    ]
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex shrink-0 px-1 {isMac ? 'h-11 items-center' : 'h-9 items-end'}" style="border-bottom: 1px solid var(--glass-border); background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur))" onmousedown={handleBarMouseDown}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tab-scroll flex flex-1 min-w-0 overflow-x-auto {isMac ? 'items-center' : 'items-end'}" style:user-select={isDragging ? 'none' : 'auto'} bind:this={scrollEl} onwheel={handleWheel} ondblclick={handleBarDblClick}>
  {#each appStore.openTabs as tab, i (tab.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="group relative flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs
        {isMac ? '' : 'mb-0.5'}
        {appStore.activeTabId === tab.id
          ? 'bg-[var(--tint-strong)] text-surface-100 shadow-[inset_0_1px_0_var(--glass-highlight)]'
          : 'text-surface-400 hover:bg-[var(--tint-hover)] hover:text-surface-200'}
        {isDragging && dragIndex === i ? 'tab-dragging' : ''}
        {isDragging && dragIndex !== i ? 'tab-shifting' : ''}"
      style:transform={getTabTransform(i)}
      style:opacity={isDragging && dragIndex === i ? 0.5 : 1}
      style:z-index={isDragging && dragIndex === i ? 10 : 'auto'}
      style:cursor={isDragging ? 'grabbing' : 'pointer'}
      role="tab"
      tabindex="0"
      aria-selected={appStore.activeTabId === tab.id}
      onclick={() => handleTabClick(tab.id)}
      onauxclick={(e) => handleTabMiddleClick(e, tab.id)}
      oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTabClick(tab.id) }}
      onpointerdown={(e) => handlePointerDown(e, i)}
      ondragstart={(e) => e.preventDefault()}
    >
      {#if tab.pinned}
        <svg class="h-2.5 w-2.5 text-brand-400" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="4" />
        </svg>
      {/if}

      {#if tab.type === 'websocket'}
        <span class="font-mono text-[9px] font-bold" style:color={getMethodColor('WEBSOCKET')} style:font-feature-settings="'tnum' 1, 'zero' 1">
          WS
        </span>
      {:else if tab.type === 'request' && tab.method}
        <span class="font-mono text-[9px] font-bold" style:color={getMethodColor(tab.method ?? 'GET')} style:font-feature-settings="'tnum' 1, 'zero' 1">
          {tab.method.slice(0, 3)}
        </span>
      {:else if tab.type === 'environment'}
        <svg class="h-3 w-3" style="color: var(--color-success)" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      {:else if tab.type === 'mcp'}
        <svg class="h-3 w-3" style="color: var(--color-brand-400)" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22v-5"/>
          <path d="M9 8V2"/>
          <path d="M15 8V2"/>
          <path d="M18 8v5a6 6 0 01-12 0V8h12z"/>
        </svg>
      {/if}

      <span class="max-w-[120px] truncate">
        {tab.label}
      </span>

      {#if tab.isUnsaved}
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"></span>
      {/if}

      {#if !tab.pinned}
        <button
          onclick={(e) => handleTabClose(e, tab.id)}
          aria-label="Close tab"
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-surface-500 opacity-0 transition-all duration-150 hover:bg-[var(--tint-strong)] hover:text-surface-200 group-hover:opacity-100"
        >
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  {/each}
  </div>

  <div class="flex self-stretch">
    <EnvironmentSelector />
  </div>
</div>

<style>
  .tab-scroll::-webkit-scrollbar { height: 3px; }
  .tab-scroll::-webkit-scrollbar-track { background: transparent; }
  .tab-scroll::-webkit-scrollbar-thumb { background: var(--color-surface-600); border-radius: 1.5px; }

  .tab-dragging {
    position: relative;
    pointer-events: none;
  }
  .tab-shifting {
    transition: transform 200ms ease;
  }
</style>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems(contextMenu.tabId)}
    onclose={() => contextMenu = null}
  />
{/if}
