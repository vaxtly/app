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

  /** Action that appends the element to document.body (escapes parent stacking contexts) */
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
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

<div class="flex items-center self-stretch">
  <!-- Trigger button -->
  <button
    bind:this={buttonEl}
    onclick={toggle}
    class="env-trigger flex items-center gap-1.5 px-2.5 h-full border-none bg-transparent text-surface-400 text-[11px] font-sans cursor-pointer whitespace-nowrap border-l border-l-transparent transition-[color,background] duration-150"
    class:env-trigger--active={isActive}
    class:env-trigger--open={open}
  >
    <!-- Status LED -->
    <span
      class="env-led w-1.5 h-1.5 rounded-full bg-surface-600 shrink-0 transition-[background,box-shadow] duration-200"
      class:env-led--on={isActive}
    ></span>

    <span class="max-w-[120px] overflow-hidden text-ellipsis">
      {environmentsStore.activeEnvironment?.name ?? 'No Environment'}
    </span>

    <svg
      class="env-chevron shrink-0 opacity-50 transition-[transform,opacity] duration-200 ease-out"
      class:env-chevron--open={open}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
    >
      <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <!-- Dropdown panel -->
  {#if open}
    <div
      bind:this={panelEl}
      use:portal
      class="fixed z-[9999] w-60 rounded-xl overflow-hidden animate-[dropdown-in_0.15s_ease-out]"
      style="{panelStyle} background: var(--glass-bg-heavy); backdrop-filter: blur(var(--glass-blur-heavy)); -webkit-backdrop-filter: blur(var(--glass-blur-heavy)); border: 1px solid var(--glass-border); box-shadow: var(--shadow-dropdown);"
    >
      <!-- Search -->
      <div class="flex items-center gap-1.5 px-2.5 py-2" style="border-bottom: 1px solid var(--glass-border)">
        <svg class="shrink-0 text-surface-500" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          bind:this={searchEl}
          type="text"
          placeholder="Filter environments…"
          bind:value={search}
          class="env-search w-full bg-transparent border-none outline-none text-surface-200 text-xs font-sans"
        />
      </div>

      <!-- Scope indicator -->
      {#if hasAssociatedEnvs && !showAll}
        <div class="flex items-center gap-[5px] px-3 py-[5px] text-[10px] text-surface-400 bg-brand-500/[0.06] tracking-[0.02em]" style="border-bottom: 1px solid var(--glass-border)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          {activeCollection?.name ?? 'Collection'}
        </div>
      {/if}

      <!-- Environment list -->
      <div class="max-h-[220px] overflow-y-auto">
        <!-- No Environment option -->
        <button
          onclick={handleDeactivate}
          class="env-item flex items-center gap-2 w-full px-3 py-1.5 border-none bg-transparent text-surface-200 text-xs font-sans cursor-pointer text-left rounded-lg mx-1 transition-[background,color] duration-100 hover:bg-[var(--tint-muted)] hover:text-surface-100" style="width: calc(100% - 8px)"
          class:env-item--selected={!environmentsStore.activeEnvironmentId}
        >
          <span class="w-3.5 h-3.5 flex items-center justify-center shrink-0">
            {#if !environmentsStore.activeEnvironmentId}
              <span class="env-item-check w-1.5 h-1.5 rounded-full bg-success"></span>
            {/if}
          </span>
          <span class="env-item-name--muted overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">No Environment</span>
        </button>

        <div class="h-px my-1 mx-2" style="background: var(--glass-border)"></div>

        {#each visibleEnvironments as env (env.id)}
          {@const selected = environmentsStore.activeEnvironmentId === env.id}
          <button
            onclick={() => handleSelect(env)}
            class="env-item flex items-center gap-2 w-full px-3 py-1.5 border-none bg-transparent text-surface-200 text-xs font-sans cursor-pointer text-left rounded-lg mx-1 transition-[background,color] duration-100 hover:bg-[var(--tint-muted)] hover:text-surface-100" style="width: calc(100% - 8px)"
            class:env-item--selected={selected}
          >
            <span class="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {#if selected}
                <span class="env-item-check w-1.5 h-1.5 rounded-full bg-success"></span>
              {/if}
            </span>
            <span class="overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">{env.name}</span>
            {#if selected}
              <span class="text-[9px] uppercase tracking-[0.06em] text-success opacity-70 shrink-0">Active</span>
            {/if}
          </button>
        {:else}
          <div class="px-2.5 py-3 text-center text-[11px] text-surface-500">
            {search.trim() ? 'No matches' : 'No environments'}
          </div>
        {/each}
      </div>

      <!-- Show all toggle -->
      {#if hasAssociatedEnvs}
        <button
          onclick={() => showAll = !showAll}
          class="env-show-all flex items-center gap-1.5 w-full px-3 py-[7px] border-none bg-transparent text-brand-400 text-[11px] font-sans cursor-pointer transition-[background,color] duration-100"
          style="border-top: 1px solid var(--glass-border)"
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
  /* --- Trigger: hover / active / open states --- */
  .env-trigger:hover {
    background: var(--tint-subtle);
    color: var(--color-surface-200);
  }

  .env-trigger--active {
    color: var(--color-surface-200);
    border-left-color: var(--glass-border);
  }

  .env-trigger--open {
    background: var(--tint-muted);
    color: var(--color-surface-100);
  }

  /* --- LED glow + pulse --- */
  .env-led--on {
    background: var(--color-success);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-success) 50%, transparent);
    animation: led-pulse 2.5s ease-in-out infinite;
  }

  @keyframes led-pulse {
    0%, 100% { box-shadow: 0 0 4px color-mix(in srgb, var(--color-success) 40%, transparent); }
    50% { box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 70%, transparent); }
  }

  /* --- Chevron: parent hover + open --- */
  .env-trigger:hover .env-chevron { opacity: 0.8; }
  .env-chevron--open { transform: rotate(180deg); opacity: 0.8; }

  /* --- Search placeholder --- */
  .env-search::placeholder {
    color: var(--color-surface-500);
  }

  /* --- Item selection color --- */
  .env-item--selected {
    color: var(--color-surface-100);
  }

  /* --- Check dot glow --- */
  .env-item-check {
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-success) 50%, transparent);
  }

  /* --- Muted name + selected override --- */
  .env-item-name--muted {
    color: var(--color-surface-500);
    font-style: italic;
  }

  .env-item--selected .env-item-name--muted {
    color: var(--color-surface-300);
  }

  /* --- Show all: hover --- */
  .env-show-all:hover {
    background: color-mix(in srgb, var(--color-brand-500) 8%, transparent);
    color: var(--color-brand-300);
  }
</style>
