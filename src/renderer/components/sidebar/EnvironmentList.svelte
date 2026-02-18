<script lang="ts">
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import ContextMenu from '../shared/ContextMenu.svelte'

  interface Props {
    onenvironmentclick: (environmentId: string) => void
  }

  let { onenvironmentclick }: Props = $props()

  let contextMenu = $state<{ x: number; y: number; envId: string } | null>(null)

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
      { label: 'Edit', action: () => onenvironmentclick(envId) },
      { label: env.is_active ? 'Deactivate' : 'Activate', action: () => toggleActive(envId) },
      { label: '', action: () => {}, separator: true },
      { label: 'Delete', action: () => environmentsStore.remove(envId), danger: true },
    ]
  }
</script>

<div class="flex flex-col gap-1 p-2">
  <!-- Header -->
  <div class="flex items-center justify-between px-2 py-1">
    <span class="text-[10px] font-medium uppercase tracking-wider text-surface-500">Environments</span>
    <button
      onclick={createEnvironment}
      aria-label="Create environment"
      class="flex h-5 w-5 items-center justify-center rounded text-surface-400 hover:bg-surface-700 hover:text-brand-400"
    >
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>

  <!-- Environment list -->
  {#if environmentsStore.environments.length === 0}
    <p class="px-2 py-4 text-center text-xs text-surface-500">No environments yet.</p>
  {:else}
    {#each environmentsStore.environments as env (env.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="group flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-800"
        oncontextmenu={(e) => handleContextMenu(e, env.id)}
      >
        <!-- Active toggle -->
        <button
          onclick={() => toggleActive(env.id)}
          aria-label={env.is_active ? 'Deactivate environment' : 'Activate environment'}
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {env.is_active ? 'border-green-400 bg-green-400/20' : 'border-surface-600 hover:border-surface-400'}"
        >
          {#if env.is_active}
            <span class="h-2 w-2 rounded-full bg-green-400"></span>
          {/if}
        </button>

        <!-- Name (clickable) -->
        <button
          onclick={() => onenvironmentclick(env.id)}
          class="min-w-0 flex-1 truncate text-left text-xs {env.is_active ? 'font-medium text-green-300' : 'text-surface-300'}"
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
