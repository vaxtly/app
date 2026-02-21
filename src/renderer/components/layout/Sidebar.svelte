<script lang="ts">
  import { appStore } from '../../lib/stores/app.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import CollectionTree from '../sidebar/CollectionTree.svelte'
  import EnvironmentList from '../sidebar/EnvironmentList.svelte'
  import WorkspaceSwitcher from '../sidebar/WorkspaceSwitcher.svelte'

  interface Props {
    onrequestclick: (requestId: string) => void
    onenvironmentclick: (environmentId: string) => void
  }

  let { onrequestclick, onenvironmentclick }: Props = $props()

  let collectionSearch = $state('')
  let environmentSearch = $state('')

  let theme = $derived(settingsStore.get('app.theme'))
  let layout = $derived(settingsStore.get('request.layout'))
  let hasExpanded = $derived(collectionsStore.expandedIds.size > 0)

  let searchValue = $derived(appStore.sidebarMode === 'collections' ? collectionSearch : environmentSearch)

  function handleSearchInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value
    if (appStore.sidebarMode === 'collections') {
      collectionSearch = value
      appStore.setSidebarSearch(value)
    } else {
      environmentSearch = value
    }
  }

  async function handleNewCollection(): Promise<void> {
    await collectionsStore.createCollection('New Collection', appStore.activeWorkspaceId ?? undefined)
  }

  function cycleTheme(): void {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
    settingsStore.set('app.theme', next)
  }

  async function handleNewEnvironment(): Promise<void> {
    const env = await environmentsStore.create('New Environment', appStore.activeWorkspaceId ?? undefined)
    onenvironmentclick(env.id)
  }
</script>

<div class="flex h-full flex-col bg-surface-900">
  <!-- Workspace switcher -->
  <div class="drag-region shrink-0" style="padding-top: {window.navigator.userAgent.includes('Macintosh') ? 'calc(2rem + 6px)' : '0'}">
    <WorkspaceSwitcher />
  </div>

  <!-- Header with mode tabs -->
  <div class="flex shrink-0 flex-col border-b border-surface-700">
    <div class="flex items-center gap-0.5 px-2 py-1">
      <button
        onclick={() => appStore.setSidebarMode('collections')}
        class="rounded-md px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors
          {appStore.sidebarMode === 'collections'
            ? 'bg-surface-800 text-surface-200'
            : 'text-surface-500 hover:text-surface-300'}"
      >
        Collections
      </button>
      <button
        onclick={() => appStore.setSidebarMode('environments')}
        class="rounded-md px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors
          {appStore.sidebarMode === 'environments'
            ? 'bg-surface-800 text-surface-200'
            : 'text-surface-500 hover:text-surface-300'}"
      >
        Environments
      </button>

      <div class="flex-1"></div>

      {#if appStore.sidebarMode === 'collections'}
        <button
          onclick={handleNewCollection}
          class="flex h-5 w-5 items-center justify-center rounded text-surface-400 hover:bg-surface-700 hover:text-brand-400"
          title="New Collection"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 4v16m8-8H4" />
          </svg>
        </button>
      {:else}
        <button
          onclick={handleNewEnvironment}
          class="flex h-5 w-5 items-center justify-center rounded text-surface-400 hover:bg-surface-700 hover:text-brand-400"
          title="New Environment"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 4v16m8-8H4" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Search (shared) -->
  <div class="shrink-0 px-2 py-2">
    <div class="relative">
      <svg class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={searchValue}
        oninput={handleSearchInput}
        placeholder="Search..."
        class="h-7 w-full rounded-md border border-surface-700/50 bg-surface-800/50 pl-7 pr-2 text-xs text-surface-200 placeholder-surface-500 transition-[border-color] duration-150 focus:border-brand-500 focus:outline-none"
      />
    </div>
  </div>

  {#if appStore.sidebarMode === 'collections'}
    <!-- Collection tree -->
    <div class="flex-1 overflow-y-auto px-1 pb-2">
      <CollectionTree searchFilter={searchValue} {onrequestclick} />
    </div>
  {:else}
    <!-- Environment list -->
    <div class="flex-1 overflow-y-auto">
      <EnvironmentList searchFilter={searchValue} {onenvironmentclick} />
    </div>
  {/if}

  <!-- Footer toolbar -->
  <div class="flex h-8 shrink-0 items-center px-1.5" style="border-top: 1px solid var(--border-subtle)">
    <!-- Left group: mode icons -->
    <div class="flex items-center gap-0.5">
      <button
        onclick={() => appStore.setSidebarMode('collections')}
        class="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-700/50
          {appStore.sidebarMode === 'collections' ? 'text-brand-400' : 'text-surface-500 hover:text-surface-300'}"
        title="Collections"
      >
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>
      <button
        onclick={() => appStore.setSidebarMode('environments')}
        class="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-700/50
          {appStore.sidebarMode === 'environments' ? 'text-brand-400' : 'text-surface-500 hover:text-surface-300'}"
        title="Environments"
      >
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      </button>
    </div>

    <div class="flex-1"></div>

    <!-- Right group: layout, expand/collapse, settings -->
    <div class="flex items-center gap-0.5">
      <!-- Layout toggle -->
      <button
        onclick={() => settingsStore.set('request.layout', layout === 'columns' ? 'rows' : 'columns')}
        class="flex h-6 w-6 items-center justify-center rounded text-surface-500 hover:bg-surface-700/50 hover:text-surface-300"
        title={layout === 'columns' ? 'Switch to rows layout' : 'Switch to columns layout'}
      >
        {#if layout === 'columns'}
          <svg class="h-3.5 w-3.5" viewBox="0 0 28 20" fill="none">
            <rect x="1" y="1" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="15" y="1" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        {:else}
          <svg class="h-3.5 w-3.5" viewBox="0 0 28 20" fill="none">
            <rect x="1" y="1" width="26" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="1" y="11" width="26" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        {/if}
      </button>

      <!-- Theme cycle -->
      <button
        onclick={cycleTheme}
        class="flex h-6 w-6 items-center justify-center rounded text-surface-500 hover:bg-surface-700/50 hover:text-surface-300"
        title={theme === 'dark' ? 'Theme: Dark' : theme === 'light' ? 'Theme: Light' : 'Theme: System'}
      >
        {#if theme === 'dark'}
          <!-- Moon -->
          <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M17 11.36A7.5 7.5 0 118.64 3 5.5 5.5 0 0017 11.36z"/>
          </svg>
        {:else if theme === 'light'}
          <!-- Sun -->
          <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="10" cy="10" r="3.5"/>
            <path d="M10 3V4.5M10 15.5V17M17 10H15.5M4.5 10H3M14.95 5.05L13.89 6.11M6.11 13.89L5.05 14.95M14.95 14.95L13.89 13.89M6.11 6.11L5.05 5.05"/>
          </svg>
        {:else}
          <!-- Monitor -->
          <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="14" height="10" rx="1.5"/>
            <path d="M7 16h6M10 13v3"/>
          </svg>
        {/if}
      </button>

      <!-- Expand/collapse all (collections mode only) -->
      {#if appStore.sidebarMode === 'collections'}
        <button
          onclick={() => hasExpanded ? collectionsStore.collapseAll() : collectionsStore.expandAll()}
          class="flex h-6 w-6 items-center justify-center rounded text-surface-500 hover:bg-surface-700/50 hover:text-surface-300"
          title={hasExpanded ? 'Collapse all' : 'Expand all'}
        >
          {#if hasExpanded}
            <!-- Chevrons up (collapse) -->
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M7 11l5-5 5 5M7 17l5-5 5 5" />
            </svg>
          {:else}
            <!-- Chevrons down (expand) -->
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M7 7l5 5 5-5M7 13l5 5 5-5" />
            </svg>
          {/if}
        </button>
      {/if}

      <!-- Settings -->
      <button
        onclick={() => appStore.openSettings()}
        class="flex h-6 w-6 items-center justify-center rounded text-surface-500 hover:bg-surface-700/50 hover:text-surface-300"
        title="Settings"
      >
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>
    </div>
  </div>

</div>
