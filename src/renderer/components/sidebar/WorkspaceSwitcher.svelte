<script lang="ts">
  import { onMount } from 'svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'

  let dropdownOpen = $state(false)
  let renamingId = $state<string | null>(null)
  let renameValue = $state('')
  let renameInput = $state<HTMLInputElement | null>(null)

  function toggleDropdown(): void {
    dropdownOpen = !dropdownOpen
  }

  async function switchWorkspace(id: string): Promise<void> {
    if (id === appStore.activeWorkspaceId) {
      dropdownOpen = false
      return
    }
    appStore.setActiveWorkspace(id)
    await collectionsStore.loadAll(id)
    await environmentsStore.loadAll(id)
    appStore.closeAllTabs()
    dropdownOpen = false
  }

  async function createNewWorkspace(): Promise<void> {
    const ws = await appStore.createWorkspace('New Workspace')
    await switchWorkspace(ws.id)
    // Start renaming immediately
    renamingId = ws.id
    renameValue = ws.name
    requestAnimationFrame(() => renameInput?.select())
  }

  function startRename(id: string, name: string): void {
    renamingId = id
    renameValue = name
    requestAnimationFrame(() => renameInput?.select())
  }

  async function commitRename(): Promise<void> {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      await appStore.renameWorkspace(renamingId, trimmed)
    }
    renamingId = null
  }

  function handleRenameKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') { renamingId = null }
  }

  async function handleDelete(id: string): Promise<void> {
    if (appStore.workspaces.length <= 1) return
    await appStore.deleteWorkspace(id)
    if (appStore.activeWorkspaceId === id && appStore.workspaces.length > 0) {
      await switchWorkspace(appStore.workspaces[0].id)
    }
  }

  // Close dropdown on outside click
  onMount(() => {
    function handleClick(e: MouseEvent): void {
      const target = e.target as HTMLElement
      if (dropdownOpen && !target.closest('.workspace-switcher')) {
        dropdownOpen = false
        renamingId = null
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  })
</script>

<div class="workspace-switcher relative no-drag">
  <!-- Trigger -->
  <button
    onclick={toggleDropdown}
    class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-surface-800"
  >
    <svg class="h-3.5 w-3.5 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
    <span class="min-w-0 flex-1 truncate text-xs font-medium text-surface-300">
      {appStore.activeWorkspace?.name ?? 'Workspace'}
    </span>
    <svg class="h-3 w-3 shrink-0 text-surface-500 transition-transform {dropdownOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Dropdown -->
  {#if dropdownOpen}
    <div class="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-surface-700 bg-surface-800 py-1 shadow-xl">
      {#each appStore.workspaces as ws (ws.id)}
        <div class="group flex items-center gap-1 px-1">
          {#if renamingId === ws.id}
            <input
              bind:this={renameInput}
              bind:value={renameValue}
              onblur={commitRename}
              onkeydown={handleRenameKeydown}
              class="h-7 min-w-0 flex-1 rounded border border-brand-500 bg-surface-900 px-2 text-xs text-surface-100 outline-none"
            />
          {:else}
            <button
              onclick={() => switchWorkspace(ws.id)}
              class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-700
                {ws.id === appStore.activeWorkspaceId ? 'text-brand-400' : 'text-surface-300'}"
            >
              {#if ws.id === appStore.activeWorkspaceId}
                <svg class="h-3 w-3 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              {:else}
                <div class="h-3 w-3 shrink-0"></div>
              {/if}
              <span class="truncate">{ws.name}</span>
            </button>

            <!-- Hover actions -->
            <button
              onclick={(e) => { e.stopPropagation(); startRename(ws.id, ws.name) }}
              aria-label="Rename workspace"
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-surface-500 opacity-0 hover:bg-surface-600 hover:text-surface-200 group-hover:opacity-100"
            >
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {#if appStore.workspaces.length > 1}
              <button
                onclick={(e) => { e.stopPropagation(); handleDelete(ws.id) }}
                aria-label="Delete workspace"
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-surface-500 opacity-0 hover:bg-red-900/50 hover:text-red-400 group-hover:opacity-100"
              >
                <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            {/if}
          {/if}
        </div>
      {/each}

      <!-- Separator + New -->
      <div class="mx-1 my-1 border-t border-surface-700"></div>
      <button
        onclick={createNewWorkspace}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-surface-400 hover:bg-surface-700 hover:text-surface-200"
      >
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 4v16m8-8H4" />
        </svg>
        New Workspace
      </button>
    </div>
  {/if}
</div>
