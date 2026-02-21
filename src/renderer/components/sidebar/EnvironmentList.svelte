<script lang="ts">
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import ContextMenu from '../shared/ContextMenu.svelte'

  interface Props {
    onenvironmentclick: (environmentId: string) => void
    searchFilter?: string
  }

  let { onenvironmentclick, searchFilter = '' }: Props = $props()
  let contextMenu = $state<{ x: number; y: number; envId: string } | null>(null)

  let filteredEnvironments = $derived(
    searchFilter.trim()
      ? environmentsStore.environments.filter((e) => e.name.toLowerCase().includes(searchFilter.trim().toLowerCase()))
      : environmentsStore.environments
  )

  async function createEnvironment(): Promise<void> {
    const env = await environmentsStore.create('New Environment', appStore.activeWorkspaceId ?? undefined)
    onenvironmentclick(env.id)
  }

  async function toggleActive(envId: string): Promise<void> {
    const env = environmentsStore.getById(envId)
    if (!env) return

    if (env.is_active) {
      await environmentsStore.deactivate(envId)
    } else {
      await environmentsStore.activate(envId, appStore.activeWorkspaceId ?? undefined)
    }
  }

  function handleContextMenu(e: MouseEvent, envId: string): void {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY, envId }
  }

  function getContextMenuItems(envId: string) {
    const env = environmentsStore.getById(envId)
    if (!env) return []
    return [
      { label: 'Edit', action: () => onenvironmentclick(envId), icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z' },
      { label: env.is_active ? 'Deactivate' : 'Activate', action: () => toggleActive(envId), icon: env.is_active ? 'M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9' : 'M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9' },
      { label: '', action: () => {}, separator: true },
      { label: 'Delete', action: () => environmentsStore.remove(envId), danger: true, icon: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' },
    ]
  }
</script>

<div class="flex flex-col px-1 pb-2">
  <!-- Environment list -->
  {#if filteredEnvironments.length === 0}
    <p class="px-2 py-4 text-center text-xs text-surface-500">{searchFilter.trim() ? 'No matches' : 'No environments yet.'}</p>
  {:else}
    {#each filteredEnvironments as env (env.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="group flex items-center gap-2 rounded-lg px-2 py-1 transition-all duration-150 hover:bg-[var(--tint-hover)]"
        oncontextmenu={(e) => handleContextMenu(e, env.id)}
      >
        <!-- Active toggle -->
        <button
          onclick={() => toggleActive(env.id)}
          aria-label={env.is_active ? 'Deactivate environment' : 'Activate environment'}
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-150 {env.is_active ? '' : 'border-[var(--tint-strong)] hover:border-[var(--tint-bold)]'}"
          style={env.is_active ? 'border-color: var(--color-success); background: color-mix(in srgb, var(--color-success) 20%, transparent)' : ''}
        >
          {#if env.is_active}
            <span class="h-2 w-2 rounded-full" style="background: var(--color-success)"></span>
          {/if}
        </button>

        <!-- Name (clickable) -->
        <button
          onclick={() => onenvironmentclick(env.id)}
          class="min-w-0 flex-1 truncate text-left text-[13px] {env.is_active ? 'font-medium' : 'text-surface-300'}"
          style:color={env.is_active ? 'var(--color-success)' : undefined}
        >
          {env.name}
        </button>

        <!-- Variable count -->
        {#if env.variables}
          {@const count = (() => { try { return JSON.parse(env.variables).length } catch { return 0 } })()}
          {#if count > 0}
            <span class="text-[10px] text-surface-500">{count}</span>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems(contextMenu.envId)}
    onclose={() => contextMenu = null}
  />
{/if}
