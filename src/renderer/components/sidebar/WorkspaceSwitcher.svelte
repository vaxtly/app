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

<div class="workspace-switcher ws-root no-drag">
  <!-- Trigger -->
  <button onclick={toggleDropdown} class="ws-trigger">
    <svg class="ws-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
    <span class="ws-label">
      {appStore.activeWorkspace?.name ?? 'Workspace'}
    </span>
    <svg class="ws-chevron" class:ws-chevron--open={dropdownOpen} width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <!-- Dropdown -->
  {#if dropdownOpen}
    <div class="ws-panel">
      <!-- Workspace list -->
      <div class="ws-list">
        {#each appStore.workspaces as ws (ws.id)}
          {@const isActive = ws.id === appStore.activeWorkspaceId}
          <div class="ws-item-row" class:ws-item-row--active={isActive}>
            {#if renamingId === ws.id}
              <input
                bind:this={renameInput}
                bind:value={renameValue}
                onblur={commitRename}
                onkeydown={handleRenameKeydown}
                class="ws-rename-input"
              />
            {:else}
              <button onclick={() => switchWorkspace(ws.id)} class="ws-item" class:ws-item--active={isActive}>
                <span class="ws-item-indicator">
                  {#if isActive}
                    <span class="ws-item-dot"></span>
                  {/if}
                </span>
                <span class="ws-item-name">{ws.name}</span>
              </button>

              <!-- Hover actions (absolute overlay) -->
              <div class="ws-actions">
                <button
                  onclick={(e) => { e.stopPropagation(); startRename(ws.id, ws.name) }}
                  aria-label="Rename workspace"
                  class="ws-action"
                >
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {#if appStore.workspaces.length > 1}
                  <button
                    onclick={(e) => { e.stopPropagation(); handleDelete(ws.id) }}
                    aria-label="Delete workspace"
                    class="ws-action ws-action--danger"
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
      <div class="ws-divider"></div>
      <button onclick={createNewWorkspace} class="ws-new">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 4v16m8-8H4" />
        </svg>
        New Workspace
      </button>
    </div>
  {/if}
</div>

<style>
  /* --- Root --- */
  .ws-root {
    position: relative;
  }

  /* --- Trigger (matches env-trigger pattern) --- */
  .ws-trigger {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--color-surface-300);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    text-align: left;
  }

  .ws-trigger:hover {
    background: color-mix(in srgb, var(--color-surface-700) 40%, transparent);
    color: var(--color-surface-100);
  }

  .ws-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--color-surface-500);
  }

  .ws-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .ws-chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 0.2s ease, opacity 0.15s;
    color: var(--color-surface-500);
  }

  .ws-trigger:hover .ws-chevron {
    opacity: 0.8;
  }

  .ws-chevron--open {
    transform: rotate(180deg);
    opacity: 0.8;
  }

  /* --- Dropdown panel (matches env-panel) --- */
  .ws-panel {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 50;
    margin-top: 4px;
    background: var(--color-surface-800);
    border: 1px solid var(--border-dropdown);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-dropdown);
    overflow: hidden;
    animation: ws-panel-in 0.12s ease-out;
  }

  @keyframes ws-panel-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* --- List --- */
  .ws-list {
    max-height: 220px;
    overflow-y: auto;
    padding: 0;
  }

  /* --- Item row (contains button + hover actions) --- */
  .ws-item-row {
    position: relative;
    transition: background 0.1s;
  }

  .ws-item-row:hover {
    background: var(--color-surface-700);
  }

  .ws-item-row:hover .ws-actions {
    opacity: 1;
  }

  .ws-item-row:hover .ws-item {
    color: var(--color-surface-100);
  }

  /* --- Item button (matches env-item) --- */
  .ws-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--color-surface-200);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: color 0.1s;
  }

  .ws-item--active {
    color: var(--color-surface-100);
  }

  /* --- Action buttons overlay --- */
  .ws-actions {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
  }

  /* --- Indicator (matches env-item-indicator) --- */
  .ws-item-indicator {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .ws-item-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-brand-400);
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-brand-400) 50%, transparent);
  }

  /* --- Item name --- */
  .ws-item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  /* --- Hover action buttons --- */
  .ws-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-surface-500);
    cursor: pointer;
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

  /* --- Rename input --- */
  .ws-rename-input {
    flex: 1;
    min-width: 0;
    height: 28px;
    margin: 2px 4px;
    padding: 0 8px;
    border: 1px solid var(--color-brand-500);
    border-radius: var(--radius-sm);
    background: var(--color-surface-900);
    color: var(--color-surface-100);
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }

  /* --- Divider (matches env-divider) --- */
  .ws-divider {
    height: 1px;
    background: var(--color-surface-700);
    margin: 4px 0;
  }

  /* --- New workspace button (matches env-show-all) --- */
  .ws-new {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .ws-new:hover {
    background: color-mix(in srgb, var(--color-surface-600) 50%, transparent);
    color: var(--color-surface-200);
  }
</style>
