<script lang="ts">
  import Modal from '../shared/Modal.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'

  interface Props {
    targetId: string
    targetType: 'collection' | 'folder'
    onclose: () => void
  }

  let { targetId, targetType, onclose }: Props = $props()

  let searchQuery = $state('')
  let selectedIds = $state<Set<string>>(new Set())
  let defaultEnvId = $state<string | null>(null)
  let saving = $state(false)

  // Load current associations
  $effect(() => {
    loadCurrent()
  })

  function loadCurrent(): void {
    if (targetType === 'collection') {
      const col = collectionsStore.getCollectionById(targetId)
      if (col) {
        const ids: string[] = col.environment_ids ? JSON.parse(col.environment_ids) : []
        selectedIds = new Set(ids)
        defaultEnvId = col.default_environment_id
      }
    } else {
      const folder = collectionsStore.folders.find((f) => f.id === targetId)
      if (folder) {
        const ids: string[] = folder.environment_ids ? JSON.parse(folder.environment_ids) : []
        selectedIds = new Set(ids)
        defaultEnvId = folder.default_environment_id
      }
    }
  }

  let filteredEnvironments = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return environmentsStore.environments
    return environmentsStore.environments.filter((e) => e.name.toLowerCase().includes(q))
  })

  function toggleEnv(id: string): void {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
      if (defaultEnvId === id) defaultEnvId = null
    } else {
      next.add(id)
    }
    selectedIds = next
  }

  function setDefault(id: string): void {
    if (!selectedIds.has(id)) {
      selectedIds = new Set([...selectedIds, id])
    }
    defaultEnvId = defaultEnvId === id ? null : id
  }

  async function handleSave(): Promise<void> {
    saving = true
    try {
      const ids = JSON.stringify([...selectedIds])
      if (targetType === 'collection') {
        await window.api.collections.update(targetId, {
          environment_ids: ids,
          default_environment_id: defaultEnvId,
        })
      } else {
        await window.api.folders.update(targetId, {
          environment_ids: ids,
          default_environment_id: defaultEnvId,
        })
      }
      onclose()
    } finally {
      saving = false
    }
  }
</script>

<Modal title="Set Environments" {onclose} width="max-w-md">
  <!-- Search -->
  <div class="mb-3">
    <input
      type="text"
      value={searchQuery}
      oninput={(e) => { searchQuery = (e.target as HTMLInputElement).value }}
      placeholder="Search environments..."
      class="h-7 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-200 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
    />
  </div>

  <!-- Environment list -->
  <div class="max-h-60 overflow-y-auto">
    {#each filteredEnvironments as env (env.id)}
      <div class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-700/50">
        <!-- Checkbox -->
        <button
          onclick={() => toggleEnv(env.id)}
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors
            {selectedIds.has(env.id) ? 'border-brand-500 bg-brand-600' : 'border-surface-600 bg-surface-800'}"
          aria-label="Toggle {env.name}"
        >
          {#if selectedIds.has(env.id)}
            <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path d="M5 13l4 4L19 7" />
            </svg>
          {/if}
        </button>

        <!-- Name -->
        <span class="min-w-0 flex-1 truncate text-xs text-surface-200">{env.name}</span>

        <!-- Star (default) -->
        <button
          onclick={() => setDefault(env.id)}
          aria-label="Set {env.name} as default"
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors
            {defaultEnvId === env.id ? 'text-yellow-400' : 'text-surface-600 hover:text-surface-400'}"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill={defaultEnvId === env.id ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5">
            <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>
      </div>
    {/each}

    {#if filteredEnvironments.length === 0}
      <div class="py-4 text-center text-xs text-surface-500">No environments found</div>
    {/if}
  </div>

  <!-- Footer -->
  <div class="mt-4 flex items-center justify-between border-t border-surface-700 pt-4">
    <div class="text-xs text-surface-500">
      {selectedIds.size} selected{defaultEnvId ? ' (1 default)' : ''}
    </div>
    <div class="flex gap-2">
      <button onclick={onclose} class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800">
        Cancel
      </button>
      <button
        onclick={handleSave}
        disabled={saving}
        class="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  </div>
</Modal>
