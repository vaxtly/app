<script lang="ts">
  import { appStore } from '../../lib/stores/app.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
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

  async function handleNewEnvironment(): Promise<void> {
    const env = await environmentsStore.create('New Environment', appStore.activeWorkspaceId ?? undefined)
    onenvironmentclick(env.id)
  }
</script>

<div class="flex h-full flex-col bg-surface-900">
  <!-- Workspace switcher -->
  <div class="drag-region shrink-0 border-b border-surface-700 px-2" style="padding-top: {navigator.platform.includes('Mac') ? 'calc(2rem + 6px)' : '6px'}; padding-bottom: 5px">
    <WorkspaceSwitcher />
  </div>

  <!-- Header with mode tabs -->
  <div class="flex shrink-0 flex-col border-b border-surface-700">
    <div class="flex items-center gap-0.5 px-2 py-1">
      <button
        onclick={() => appStore.setSidebarMode('collections')}
        class="rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors
          {appStore.sidebarMode === 'collections'
            ? 'bg-surface-800 text-surface-200'
            : 'text-surface-500 hover:text-surface-300'}"
      >
        Collections
      </button>
      <button
        onclick={() => appStore.setSidebarMode('environments')}
        class="rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors
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
        class="h-7 w-full rounded border border-surface-700 bg-surface-800/50 pl-7 pr-2 text-xs text-surface-200 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
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

</div>
