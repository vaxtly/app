<script lang="ts">
  import { appStore } from '../../lib/stores/app.svelte'
  import { getMethodColor } from '../../lib/utils/http-colors'
  import ContextMenu from '../shared/ContextMenu.svelte'
  import EnvironmentSelector from './EnvironmentSelector.svelte'
  import type { Tab } from '../../lib/stores/app.svelte'

  let contextMenu = $state<{ x: number; y: number; tabId: string } | null>(null)

  function handleTabClick(tabId: string): void {
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

<div class="flex h-9 shrink-0 items-end overflow-x-auto border-b border-surface-700 bg-surface-900/50 px-1">
  {#each appStore.openTabs as tab (tab.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="group relative flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-t border border-b-0 px-3 text-xs transition-colors
        {appStore.activeTabId === tab.id
          ? 'border-surface-700 bg-surface-800 text-surface-100 shadow-[inset_0_-2px_0_0_var(--color-brand-500)]'
          : 'border-transparent text-surface-400 hover:bg-surface-800/50 hover:text-surface-200'}"
      role="tab"
      tabindex="0"
      aria-selected={appStore.activeTabId === tab.id}
      onclick={() => handleTabClick(tab.id)}
      onauxclick={(e) => handleTabMiddleClick(e, tab.id)}
      oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTabClick(tab.id) }}
    >
      {#if tab.pinned}
        <svg class="h-2.5 w-2.5 text-brand-400" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="4" />
        </svg>
      {/if}

      {#if tab.type === 'request' && tab.method}
        <span class="font-mono text-[9px] font-bold" style:color={getMethodColor(tab.method ?? 'GET')} style:font-feature-settings="'tnum' 1, 'zero' 1">
          {tab.method.slice(0, 3)}
        </span>
      {:else if tab.type === 'environment'}
        <svg class="h-3 w-3" style="color: var(--color-success)" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-surface-500 opacity-0 hover:bg-surface-600 hover:text-surface-200 group-hover:opacity-100"
        >
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  {/each}

  <div class="flex-1 min-w-0"></div>

  <EnvironmentSelector />
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems(contextMenu.tabId)}
    onclose={() => contextMenu = null}
  />
{/if}
