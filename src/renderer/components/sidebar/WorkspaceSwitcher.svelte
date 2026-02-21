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
    appStore.closeAllTabs()
    appStore.setActiveWorkspace(id)
    await collectionsStore.loadAll(id)
    await environmentsStore.loadAll(id)
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
    class="group flex w-full items-center gap-1.5 px-3 py-2 border-none bg-transparent text-surface-300 text-xs font-inherit cursor-pointer transition-[background,color] duration-150 text-left hover:bg-surface-700/40 hover:text-surface-100"
  >
    <svg class="w-3.5 h-3.5 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
    <span class="flex-1 min-w-0 truncate font-medium">
      {appStore.activeWorkspace?.name ?? 'Workspace'}
    </span>
    <svg
      class="shrink-0 opacity-50 text-surface-500 transition-[transform,opacity] duration-200 ease-out group-hover:opacity-80 {dropdownOpen ? 'rotate-180 opacity-80' : ''}"
      width="10" height="10" viewBox="0 0 10 10" fill="none"
    >
      <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <!-- Dropdown -->
  {#if dropdownOpen}
    <div
      class="absolute left-0 right-0 top-full z-50 mt-1 bg-surface-800 rounded-2xl shadow-dropdown overflow-hidden animate-[dropdown-in_0.12s_ease-out]"
      style="border: 1px solid var(--border-dropdown)"
    >
      <!-- Workspace list -->
      <div class="max-h-[220px] overflow-y-auto">
        {#each appStore.workspaces as ws (ws.id)}
          {@const isActive = ws.id === appStore.activeWorkspaceId}
          <div class="group/row relative transition-colors duration-100 hover:bg-surface-700">
            {#if renamingId === ws.id}
              <input
                bind:this={renameInput}
                bind:value={renameValue}
                onblur={commitRename}
                onkeydown={handleRenameKeydown}
                class="flex-1 min-w-0 h-7 mx-1 my-0.5 px-2 border border-brand-500 rounded-sm bg-surface-900 text-surface-100 text-xs font-inherit outline-none"
              />
            {:else}
              <button
                onclick={() => switchWorkspace(ws.id)}
                class="flex items-center gap-2 w-full px-3 py-1.5 border-none bg-transparent text-xs font-inherit cursor-pointer text-left transition-colors duration-100 {isActive ? 'text-surface-100' : 'text-surface-200'} group-hover/row:text-surface-100"
              >
                <span class="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                  {#if isActive}
                    <span class="ws-item-dot"></span>
                  {/if}
                </span>
                <span class="truncate flex-1 min-w-0">{ws.name}</span>
              </button>

              <!-- Hover actions (absolute overlay) -->
              <div class="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 transition-opacity duration-100 group-hover/row:opacity-100">
                <button
                  onclick={(e) => { e.stopPropagation(); startRename(ws.id, ws.name) }}
                  aria-label="Rename workspace"
                  class="ws-action flex items-center justify-center w-[22px] h-[22px] shrink-0 border-none rounded-sm bg-transparent text-surface-500 cursor-pointer"
                >
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {#if appStore.workspaces.length > 1}
                  <button
                    onclick={(e) => { e.stopPropagation(); handleDelete(ws.id) }}
                    aria-label="Delete workspace"
                    class="ws-action ws-action--danger flex items-center justify-center w-[22px] h-[22px] shrink-0 border-none rounded-sm bg-transparent text-surface-500 cursor-pointer"
                  >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Separator + New -->
      <div class="h-px bg-surface-700 my-1"></div>
      <button
        onclick={createNewWorkspace}
        class="flex items-center gap-1.5 w-full py-[7px] px-3 border-none bg-transparent text-surface-400 text-[11px] font-inherit cursor-pointer transition-[background,color] duration-100 hover:bg-surface-600/50 hover:text-surface-200"
      >
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 4v16m8-8H4" />
        </svg>
        New Workspace
      </button>
    </div>
  {/if}
</div>

<style>
  /* Active workspace dot with glow effect */
  .ws-item-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-brand-400);
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-brand-400) 50%, transparent);
  }

  /* Action button hover — uses color-mix */
  .ws-action {
    transition: color 0.12s, background 0.12s;
  }

  .ws-action:hover {
    background: color-mix(in srgb, var(--color-surface-600) 60%, transparent);
    color: var(--color-surface-200);
  }

  .ws-action--danger:hover {
    color: var(--color-danger);
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  }
</style>
