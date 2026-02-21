<script lang="ts">
  import { onMount } from 'svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import type { Environment } from '../../lib/types'

  let open = $state(false)
  let search = $state('')
  let showAll = $state(false)
  let panelEl = $state<HTMLElement | null>(null)
  let buttonEl = $state<HTMLElement | null>(null)
  let searchEl = $state<HTMLElement | null>(null)
  let panelStyle = $state('')

  const isActive = $derived(!!environmentsStore.activeEnvironment)

  // Derive the current collection from the active tab's request
  const activeCollection = $derived.by(() => {
    const tab = appStore.activeTab
    if (!tab || tab.type !== 'request') return null
    const req = collectionsStore.getRequestById(tab.entityId)
    if (!req?.collection_id) return null
    return collectionsStore.getCollectionById(req.collection_id) ?? null
  })

  // Parse associated environment IDs from the collection
  const associatedEnvIds = $derived.by(() => {
    if (!activeCollection?.environment_ids) return []
    try {
      const parsed = JSON.parse(activeCollection.environment_ids)
      return Array.isArray(parsed) ? parsed as string[] : []
    } catch {
      return []
    }
  })

  // Reset showAll when collection changes
  let prevCollectionId = $state<string | null>(null)
  $effect(() => {
    const colId = activeCollection?.id ?? null
    if (colId !== prevCollectionId) {
      prevCollectionId = colId
      showAll = false
    }
  })

  // Auto-focus search when panel opens
  $effect(() => {
    if (open && searchEl) {
      searchEl.focus()
    }
  })

  // Filter environments: collection-scoped or all
  const hasAssociatedEnvs = $derived(associatedEnvIds.length > 0)

  const visibleEnvironments = $derived.by(() => {
    let envs: Environment[]

    if (hasAssociatedEnvs && !showAll) {
      envs = environmentsStore.environments.filter((e) => associatedEnvIds.includes(e.id))
    } else {
      envs = environmentsStore.environments
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      envs = envs.filter((e) => e.name.toLowerCase().includes(q))
    }

    return envs
  })

  function toggle(): void {
    open = !open
    if (open) {
      search = ''
      if (buttonEl) {
        const rect = buttonEl.getBoundingClientRect()
        panelStyle = `top: ${rect.bottom + 6}px; right: ${window.innerWidth - rect.right}px;`
      }
    }
  }

  function handleSelect(env: Environment): void {
    if (environmentsStore.activeEnvironmentId === env.id) {
      environmentsStore.deactivate(env.id)
    } else {
      environmentsStore.activate(env.id, appStore.activeWorkspaceId ?? undefined)
    }
    open = false
  }

  function handleDeactivate(): void {
    if (environmentsStore.activeEnvironmentId) {
      environmentsStore.deactivate(environmentsStore.activeEnvironmentId)
    }
    open = false
  }

  onMount(() => {
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node
      if (panelEl && !panelEl.contains(target) && buttonEl && !buttonEl.contains(target)) {
        open = false
      }
    }

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') open = false
    }

    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleKey)
    }
  })
</script>

<div class="env-selector">
  <!-- Trigger button -->
  <button
    bind:this={buttonEl}
    onclick={toggle}
    class="env-trigger"
    class:env-trigger--active={isActive}
    class:env-trigger--open={open}
  >
    <!-- Status LED -->
    <span class="env-led" class:env-led--on={isActive}></span>

    <span class="env-label">
      {environmentsStore.activeEnvironment?.name ?? 'No Environment'}
    </span>

    <svg class="env-chevron" class:env-chevron--open={open} width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <!-- Dropdown panel -->
  {#if open}
    <div
      bind:this={panelEl}
      class="env-panel"
      style={panelStyle}
    >
      <!-- Search -->
      <div class="env-search-wrap">
        <svg class="env-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          bind:this={searchEl}
          type="text"
          placeholder={"Filter environments\u2026"}
          bind:value={search}
          class="env-search"
        />
      </div>

      <!-- Scope indicator -->
      {#if hasAssociatedEnvs && !showAll}
        <div class="env-scope-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          {activeCollection?.name ?? 'Collection'}
        </div>
      {/if}

      <!-- Environment list -->
      <div class="env-list">
        <!-- No Environment option -->
        <button
          onclick={handleDeactivate}
          class="env-item env-item--none"
          class:env-item--selected={!environmentsStore.activeEnvironmentId}
        >
          <span class="env-item-indicator">
            {#if !environmentsStore.activeEnvironmentId}
              <span class="env-item-check"></span>
            {/if}
          </span>
          <span class="env-item-name env-item-name--muted">No Environment</span>
        </button>

        <div class="env-divider"></div>

        {#each visibleEnvironments as env (env.id)}
          {@const selected = environmentsStore.activeEnvironmentId === env.id}
          <button
            onclick={() => handleSelect(env)}
            class="env-item"
            class:env-item--selected={selected}
          >
            <span class="env-item-indicator">
              {#if selected}
                <span class="env-item-check"></span>
              {/if}
            </span>
            <span class="env-item-name">{env.name}</span>
            {#if selected}
              <span class="env-item-active-tag">Active</span>
            {/if}
          </button>
        {:else}
          <div class="env-empty">
            {search.trim() ? 'No matches' : 'No environments'}
          </div>
        {/each}
      </div>

      <!-- Show all toggle -->
      {#if hasAssociatedEnvs}
        <button
          onclick={() => showAll = !showAll}
          class="env-show-all"
        >
          {#if showAll}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            Show collection only
          {:else}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              <path d="M3.6 9h16.8M3.6 15h16.8"/>
              <path d="M12 3a15 15 0 014 9 15 15 0 01-4 9 15 15 0 01-4-9 15 15 0 014-9z"/>
            </svg>
            Show all environments
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* --- Trigger button --- */
  .env-selector {
    display: flex;
    align-items: center;
    align-self: stretch;
  }

  .env-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    border-left: 1px solid transparent;
    white-space: nowrap;
  }

  .env-trigger:hover {
    background: color-mix(in srgb, var(--color-surface-700) 40%, transparent);
    color: var(--color-surface-200);
  }

  .env-trigger--active {
    color: var(--color-surface-200);
    border-left-color: var(--color-surface-700);
  }

  .env-trigger--open {
    background: color-mix(in srgb, var(--color-surface-700) 50%, transparent);
    color: var(--color-surface-100);
  }

  /* --- Status LED --- */
  .env-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-surface-600);
    flex-shrink: 0;
    transition: background 0.2s, box-shadow 0.2s;
  }

  .env-led--on {
    background: var(--color-success);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-success) 50%, transparent);
    animation: led-pulse 2.5s ease-in-out infinite;
  }

  @keyframes led-pulse {
    0%, 100% { box-shadow: 0 0 4px color-mix(in srgb, var(--color-success) 40%, transparent); }
    50% { box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 70%, transparent); }
  }

  /* --- Label & chevron --- */
  .env-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .env-chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 0.2s ease, opacity 0.15s;
  }

  .env-trigger:hover .env-chevron { opacity: 0.8; }
  .env-chevron--open { transform: rotate(180deg); opacity: 0.8; }

  /* --- Dropdown panel --- */
  .env-panel {
    position: fixed;
    z-index: 100;
    width: 240px;
    background: var(--color-surface-800);
    border: 1px solid var(--border-dropdown);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-dropdown);
    overflow: hidden;
    animation: env-panel-in 0.12s ease-out;
  }

  @keyframes env-panel-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* --- Search --- */
  .env-search-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .env-search-icon {
    flex-shrink: 0;
    color: var(--color-surface-500);
  }

  .env-search {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-surface-200);
    font-size: 12px;
    font-family: inherit;
  }

  .env-search::placeholder {
    color: var(--color-surface-500);
  }

  /* --- Scope badge --- */
  .env-scope-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    font-size: 10px;
    color: var(--color-surface-400);
    background: color-mix(in srgb, var(--color-brand-500) 6%, transparent);
    border-bottom: 1px solid var(--border-subtle);
    letter-spacing: 0.02em;
  }

  /* --- List --- */
  .env-list {
    max-height: 220px;
    overflow-y: auto;
    padding: 0;
  }

  .env-divider {
    height: 1px;
    background: var(--color-surface-700);
    margin: 4px 0;
  }

  /* --- Item --- */
  .env-item {
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
    transition: background 0.1s, color 0.1s;
  }

  .env-item:hover {
    background: var(--color-surface-700);
    color: var(--color-surface-100);
  }

  .env-item--selected {
    color: var(--color-surface-100);
  }

  /* --- Indicator (check) --- */
  .env-item-indicator {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .env-item-check {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-success);
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-success) 50%, transparent);
  }

  /* --- Name --- */
  .env-item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .env-item-name--muted {
    color: var(--color-surface-500);
    font-style: italic;
  }

  .env-item--selected .env-item-name--muted {
    color: var(--color-surface-300);
  }

  /* --- Active tag --- */
  .env-item-active-tag {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-success);
    opacity: 0.7;
    flex-shrink: 0;
  }

  /* --- Empty state --- */
  .env-empty {
    padding: 12px 10px;
    text-align: center;
    font-size: 11px;
    color: var(--color-surface-500);
  }

  /* --- Show all button --- */
  .env-show-all {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 12px;
    border: none;
    border-top: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--color-brand-400);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .env-show-all:hover {
    background: color-mix(in srgb, var(--color-brand-500) 8%, transparent);
    color: var(--color-brand-300);
  }
</style>
