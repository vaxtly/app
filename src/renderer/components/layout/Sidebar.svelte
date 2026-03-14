<script lang="ts">
  import { onMount } from 'svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import CollectionTree from '../sidebar/CollectionTree.svelte'
  import EnvironmentList from '../sidebar/EnvironmentList.svelte'
  import McpServerList from '../sidebar/McpServerList.svelte'
  import WorkspaceSwitcher from '../sidebar/WorkspaceSwitcher.svelte'
  import CookieJarModal from '../modals/CookieJarModal.svelte'

  interface Props {
    onrequestclick: (requestId: string) => void
    onenvironmentclick: (environmentId: string) => void
    onmcpserverclick: (serverId: string) => void
  }

  let { onrequestclick, onenvironmentclick, onmcpserverclick }: Props = $props()

  let collectionSearch = $state('')
  let environmentSearch = $state('')
  let mcpSearch = $state('')
  let modeDropdownOpen = $state(false)
  let showCookieJar = $state(false)

  // Debounce filter for large collection trees
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

  let theme = $derived(settingsStore.get('app.theme'))
  let layout = $derived(settingsStore.get('request.layout'))
  let hasExpanded = $derived(collectionsStore.expandedIds.size > 0)

  const MODE_OPTIONS = [
    { mode: 'collections' as const, label: 'Collections' },
    { mode: 'environments' as const, label: 'Environments' },
    { mode: 'mcp' as const, label: 'MCP Servers' },
  ]

  function selectMode(mode: 'collections' | 'environments' | 'mcp'): void {
    appStore.setSidebarMode(mode)
    modeDropdownOpen = false
  }

  // Close dropdown on outside click
  onMount(() => {
    function handleClick(e: MouseEvent): void {
      const target = e.target as HTMLElement
      if (modeDropdownOpen && !target.closest('.mode-switcher')) {
        modeDropdownOpen = false
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  })

  let searchValue = $derived(
    appStore.sidebarMode === 'collections' ? collectionSearch
    : appStore.sidebarMode === 'environments' ? environmentSearch
    : mcpSearch
  )

  function handleSearchInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      if (appStore.sidebarMode === 'collections') {
        collectionSearch = value
        appStore.setSidebarSearch(value)
      } else if (appStore.sidebarMode === 'environments') {
        environmentSearch = value
      } else {
        mcpSearch = value
      }
    }, 150)
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

  async function handleNewMcpServer(): Promise<void> {
    if (!appStore.activeWorkspaceId) return
    const server = await mcpStore.createServer({
      workspace_id: appStore.activeWorkspaceId,
      name: 'New MCP Server',
    })
    onmcpserverclick(server.id)
  }
</script>

<div class="flex h-full flex-col glass">
  <!-- Workspace switcher -->
  <div class="drag-region shrink-0" style="padding-top: {window.navigator.userAgent.includes('Macintosh') ? '2rem' : '0'}">
    <WorkspaceSwitcher />
  </div>

  <!-- Header with mode selector dropdown + add button -->
  <div class="mode-switcher relative flex shrink-0 items-center gap-1 pr-2" style="border-bottom: 1px solid var(--glass-border)">
    <button
      onclick={() => modeDropdownOpen = !modeDropdownOpen}
      class="group flex h-9 flex-1 min-w-0 items-center gap-1.5 px-3 bg-transparent text-surface-300 text-xs cursor-pointer transition-all duration-150 text-left hover:bg-[var(--tint-subtle)] hover:text-surface-100"
    >
      <!-- Mode icon -->
      {#if appStore.sidebarMode === 'collections'}
        <svg class="w-3.5 h-3.5 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      {:else if appStore.sidebarMode === 'environments'}
        <svg class="w-3.5 h-3.5 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      {:else}
        <svg class="w-3.5 h-3.5 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22v-5"/>
          <path d="M9 8V2"/>
          <path d="M15 8V2"/>
          <path d="M18 8v5a6 6 0 01-12 0V8h12z"/>
        </svg>
      {/if}
      <span class="flex-1 min-w-0 truncate font-medium">
        {appStore.sidebarMode === 'collections' ? 'Collections' : appStore.sidebarMode === 'environments' ? 'Environments' : 'MCP Servers'}
      </span>
      <svg
        class="shrink-0 opacity-50 text-surface-500 transition-[transform,opacity] duration-200 ease-out group-hover:opacity-80 {modeDropdownOpen ? 'rotate-180 opacity-80' : ''}"
        width="10" height="10" viewBox="0 0 10 10" fill="none"
      >
        <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <button
      onclick={appStore.sidebarMode === 'collections' ? handleNewCollection : appStore.sidebarMode === 'environments' ? handleNewEnvironment : handleNewMcpServer}
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-surface-400 transition-all duration-150 hover:bg-[var(--tint-muted)] hover:text-brand-400"
      title={appStore.sidebarMode === 'collections' ? 'New Collection' : appStore.sidebarMode === 'environments' ? 'New Environment' : 'New MCP Server'}
    >
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 4v16m8-8H4" />
      </svg>
    </button>

    <!-- Mode dropdown -->
    {#if modeDropdownOpen}
      <div
        class="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl overflow-hidden animate-[dropdown-in_0.15s_ease-out]"
        style="background: var(--glass-bg-heavy); backdrop-filter: blur(var(--glass-blur-heavy)); -webkit-backdrop-filter: blur(var(--glass-blur-heavy)); border: 1px solid var(--glass-border); box-shadow: var(--shadow-dropdown)"
      >
        {#each MODE_OPTIONS as opt (opt.mode)}
          {@const isActive = opt.mode === appStore.sidebarMode}
          <button
            onclick={() => selectMode(opt.mode)}
            class="flex items-center gap-2 w-full px-3 py-1.5 border-none bg-transparent text-xs cursor-pointer text-left transition-colors duration-100 hover:bg-[var(--tint-muted)] {isActive ? 'text-surface-100' : 'text-surface-200 hover:text-surface-100'}"
          >
            <span class="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {#if isActive}
                <span class="mode-item-dot"></span>
              {/if}
            </span>
            {#if opt.mode === 'collections'}
              <svg class="w-3.5 h-3.5 shrink-0 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            {:else if opt.mode === 'environments'}
              <svg class="w-3.5 h-3.5 shrink-0 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            {:else}
              <svg class="w-3.5 h-3.5 shrink-0 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22v-5"/>
                <path d="M9 8V2"/>
                <path d="M15 8V2"/>
                <path d="M18 8v5a6 6 0 01-12 0V8h12z"/>
              </svg>
            {/if}
            <span class="truncate flex-1 min-w-0">{opt.label}</span>
          </button>
        {/each}
      </div>
    {/if}
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
        aria-label="Search collections"
        class="h-7 w-full rounded-lg border border-[var(--tint-muted)] bg-[var(--tint-subtle)] pl-7 pr-2 text-xs text-surface-200 placeholder-surface-500 transition-[border-color,background] duration-150 focus:border-brand-500/50 focus:bg-[var(--tint-muted)] focus:outline-none"
      />
    </div>
  </div>

  {#if appStore.sidebarMode === 'collections'}
    <!-- Collection tree -->
    <div class="sidebar-scroll flex-1 overflow-y-auto px-1 pb-2">
      <CollectionTree searchFilter={searchValue} {onrequestclick} />
    </div>
  {:else if appStore.sidebarMode === 'environments'}
    <!-- Environment list -->
    <div class="sidebar-scroll flex-1 overflow-y-auto">
      <EnvironmentList searchFilter={searchValue} {onenvironmentclick} />
    </div>
  {:else}
    <!-- MCP server list -->
    <div class="sidebar-scroll flex-1 overflow-y-auto">
      <McpServerList searchFilter={searchValue} {onmcpserverclick} />
    </div>
  {/if}

  <!-- Footer toolbar -->
  <div class="flex h-8 shrink-0 items-center px-1.5" style="border-top: 1px solid var(--glass-border)">
    <!-- Left group: mode icons -->
    <div class="flex items-center gap-0.5">
      <button
        onclick={() => appStore.setSidebarMode('collections')}
        class="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150
          {appStore.sidebarMode === 'collections' ? 'text-brand-400 bg-[var(--tint-active)]' : 'text-surface-500 hover:text-surface-300 hover:bg-[var(--tint-subtle)]'}"
        title="Collections"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>
      <button
        onclick={() => appStore.setSidebarMode('environments')}
        class="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150
          {appStore.sidebarMode === 'environments' ? 'text-brand-400 bg-[var(--tint-active)]' : 'text-surface-500 hover:text-surface-300 hover:bg-[var(--tint-subtle)]'}"
        title="Environments"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      </button>
      <button
        onclick={() => appStore.setSidebarMode('mcp')}
        class="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150
          {appStore.sidebarMode === 'mcp' ? 'text-brand-400 bg-[var(--tint-active)]' : 'text-surface-500 hover:text-surface-300 hover:bg-[var(--tint-subtle)]'}"
        title="MCP Servers"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22v-5"/>
          <path d="M9 8V2"/>
          <path d="M15 8V2"/>
          <path d="M18 8v5a6 6 0 01-12 0V8h12z"/>
        </svg>
      </button>
    </div>

    <div class="flex-1"></div>

    <!-- Right group: cookie jar, layout, expand/collapse, theme, settings -->
    <div class="flex items-center gap-0.5">
      <!-- Cookie Jar -->
      <button
        onclick={() => { showCookieJar = true }}
        class="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 transition-all duration-150 hover:bg-[var(--tint-subtle)] hover:text-surface-300"
        title="Cookie Jar"
      >
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="5" width="12" height="12" rx="2"/>
          <path d="M7 5V4a1 1 0 011-1h4a1 1 0 011 1v1"/>
          <circle cx="8" cy="9.5" r="0.75" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="11" r="0.75" fill="currentColor" stroke="none"/>
          <circle cx="10" cy="14" r="0.75" fill="currentColor" stroke="none"/>
        </svg>
      </button>

      <!-- Layout toggle -->
      <button
        onclick={() => settingsStore.set('request.layout', layout === 'columns' ? 'rows' : 'columns')}
        class="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 transition-all duration-150 hover:bg-[var(--tint-subtle)] hover:text-surface-300"
        title={layout === 'columns' ? 'Switch to rows layout' : 'Switch to columns layout'}
      >
        {#if layout === 'columns'}
          <svg class="h-5 w-5" viewBox="0 0 28 20" fill="none">
            <rect x="1" y="1" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="15" y="1" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        {:else}
          <svg class="h-5 w-5" viewBox="0 0 28 20" fill="none">
            <rect x="1" y="1" width="26" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="1" y="11" width="26" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        {/if}
      </button>

      <!-- Theme cycle -->
      <button
        onclick={cycleTheme}
        class="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 transition-all duration-150 hover:bg-[var(--tint-subtle)] hover:text-surface-300"
        title={theme === 'dark' ? 'Theme: Dark' : theme === 'light' ? 'Theme: Light' : 'Theme: System'}
      >
        {#if theme === 'dark'}
          <!-- Moon -->
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M17 11.36A7.5 7.5 0 118.64 3 5.5 5.5 0 0017 11.36z"/>
          </svg>
        {:else if theme === 'light'}
          <!-- Sun -->
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="10" cy="10" r="3.5"/>
            <path d="M10 3V4.5M10 15.5V17M17 10H15.5M4.5 10H3M14.95 5.05L13.89 6.11M6.11 13.89L5.05 14.95M14.95 14.95L13.89 13.89M6.11 6.11L5.05 5.05"/>
          </svg>
        {:else}
          <!-- Monitor -->
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="14" height="10" rx="1.5"/>
            <path d="M7 16h6M10 13v3"/>
          </svg>
        {/if}
      </button>

      <!-- Expand/collapse all (collections mode only) -->
      {#if appStore.sidebarMode === 'collections'}
        <button
          onclick={() => hasExpanded ? collectionsStore.collapseAll() : collectionsStore.expandAll()}
          class="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 transition-all duration-150 hover:bg-[var(--tint-subtle)] hover:text-surface-300"
          title={hasExpanded ? 'Collapse all' : 'Expand all'}
        >
          {#if hasExpanded}
            <!-- Chevrons up (collapse) -->
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M7 11l5-5 5 5M7 17l5-5 5 5" />
            </svg>
          {:else}
            <!-- Chevrons down (expand) -->
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M7 7l5 5 5-5M7 13l5 5 5-5" />
            </svg>
          {/if}
        </button>
      {/if}

      <!-- Settings -->
      <button
        onclick={() => appStore.openSettings()}
        class="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 transition-all duration-150 hover:bg-[var(--tint-subtle)] hover:text-surface-300"
        title="Settings"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>
    </div>
  </div>

</div>

{#if showCookieJar}
  <CookieJarModal onclose={() => { showCookieJar = false }} />
{/if}

<style>
  .sidebar-scroll { overflow-y: overlay; }
  .sidebar-scroll::-webkit-scrollbar { width: 3px; }
  .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
  .sidebar-scroll::-webkit-scrollbar-thumb { background: var(--color-surface-600); border-radius: 1.5px; }

  .mode-item-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-brand-400);
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-brand-400) 50%, transparent);
  }
</style>
