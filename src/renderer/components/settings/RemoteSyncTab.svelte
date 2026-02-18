<script lang="ts">
  import type { SyncConflict } from '../../lib/types'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import ConflictModal from '../modals/ConflictModal.svelte'

  let provider = $state<'github' | 'gitlab'>('github')
  let repository = $state('')
  let token = $state('')
  let branch = $state('main')
  let autoSync = $state(false)

  let testing = $state(false)
  let pulling = $state(false)
  let pushing = $state(false)
  let saving = $state(false)
  let status = $state<{ type: 'success' | 'error'; message: string } | null>(null)
  let activeConflict = $state<SyncConflict | null>(null)

  // Load saved sync config on mount
  $effect(() => {
    loadConfig()
  })

  async function loadConfig(): Promise<void> {
    const [p, r, t, b, a] = await Promise.all([
      window.api.settings.get('sync.provider'),
      window.api.settings.get('sync.repository'),
      window.api.settings.get('sync.token'),
      window.api.settings.get('sync.branch'),
      window.api.settings.get('sync.auto_sync'),
    ])
    if (p === 'github' || p === 'gitlab') provider = p
    if (r) repository = r
    if (t) token = t
    if (b) branch = b
    autoSync = a === 'true' || a === '1'
  }

  async function saveConfig(): Promise<void> {
    saving = true
    status = null
    try {
      await Promise.all([
        window.api.settings.set('sync.provider', provider),
        window.api.settings.set('sync.repository', repository),
        window.api.settings.set('sync.token', token),
        window.api.settings.set('sync.branch', branch),
        window.api.settings.set('sync.auto_sync', String(autoSync)),
      ])
      status = { type: 'success', message: 'Sync configuration saved' }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Failed to save' }
    } finally {
      saving = false
    }
  }

  async function testConnection(): Promise<void> {
    testing = true
    status = null
    try {
      await saveConfig()
      const ok = await window.api.sync.testConnection()
      status = ok
        ? { type: 'success', message: 'Connection successful' }
        : { type: 'error', message: 'Connection failed — check your credentials and repository' }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Connection failed' }
    } finally {
      testing = false
    }
  }

  async function pullNow(): Promise<void> {
    pulling = true
    status = null
    try {
      const result = await window.api.sync.pull(appStore.activeWorkspaceId ?? undefined)
      if (result.success) {
        status = { type: 'success', message: result.message || `Pulled ${result.pulled ?? 0} collections` }
        await collectionsStore.loadAll(appStore.activeWorkspaceId ?? undefined)
      } else if (result.conflicts && result.conflicts.length > 0) {
        activeConflict = result.conflicts[0]
      } else {
        status = { type: 'error', message: result.message || 'Pull failed' }
      }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Pull failed' }
    } finally {
      pulling = false
    }
  }

  async function pushAll(): Promise<void> {
    pushing = true
    status = null
    try {
      const result = await window.api.sync.pushAll(appStore.activeWorkspaceId ?? undefined)
      if (result.success) {
        status = { type: 'success', message: result.message || `Pushed ${result.pushed ?? 0} collections` }
        await collectionsStore.loadAll(appStore.activeWorkspaceId ?? undefined)
      } else {
        status = { type: 'error', message: result.message || 'Push failed' }
      }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Push failed' }
    } finally {
      pushing = false
    }
  }

  function toggleAutoSync(): void {
    autoSync = !autoSync
  }

  async function handleConflictResolve(resolution: 'keep-local' | 'keep-remote'): Promise<void> {
    if (!activeConflict) return
    try {
      const result = await window.api.sync.resolveConflict(activeConflict.collectionId, resolution, appStore.activeWorkspaceId ?? undefined)
      if (result.success) {
        status = { type: 'success', message: `Conflict resolved: ${resolution}` }
        await collectionsStore.loadAll(appStore.activeWorkspaceId ?? undefined)
      } else {
        status = { type: 'error', message: result.message || 'Resolution failed' }
      }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Resolution failed' }
    }
    activeConflict = null
  }
</script>

<div class="space-y-4">
  <!-- Status banner -->
  {#if status}
    <div class="rounded border px-3 py-2 text-xs {status.type === 'success'
      ? 'border-green-800 bg-green-900/30 text-green-300'
      : 'border-red-800 bg-red-900/30 text-red-300'}">
      {status.message}
    </div>
  {/if}

  <!-- Provider -->
  <div class="flex items-center justify-between py-1">
    <div>
      <div class="text-sm text-surface-200">Provider</div>
      <div class="text-xs text-surface-500">Git hosting service for remote sync</div>
    </div>
    <select
      value={provider}
      onchange={(e) => { provider = (e.target as HTMLSelectElement).value as 'github' | 'gitlab' }}
      class="h-7 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 focus:border-brand-500 focus:outline-none"
    >
      <option value="github">GitHub</option>
      <option value="gitlab">GitLab</option>
    </select>
  </div>

  <!-- Repository -->
  <div>
    <div class="mb-1 text-sm text-surface-200">Repository</div>
    <input
      type="text"
      value={repository}
      oninput={(e) => { repository = (e.target as HTMLInputElement).value }}
      placeholder="owner/repository"
      class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
    />
    <div class="mt-1 text-xs text-surface-500">Format: owner/repo (e.g., acme/api-collections)</div>
  </div>

  <!-- Token -->
  <div>
    <div class="mb-1 text-sm text-surface-200">Access Token</div>
    <input
      type="password"
      value={token}
      oninput={(e) => { token = (e.target as HTMLInputElement).value }}
      placeholder="ghp_... or glpat-..."
      class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
    />
    <div class="mt-1 text-xs text-surface-500">Personal access token with repo read/write permissions</div>
  </div>

  <!-- Branch -->
  <div>
    <div class="mb-1 text-sm text-surface-200">Branch</div>
    <input
      type="text"
      value={branch}
      oninput={(e) => { branch = (e.target as HTMLInputElement).value }}
      placeholder="main"
      class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
    />
  </div>

  <!-- Auto Sync -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">Auto Sync</div>
      <div class="text-xs text-surface-500">Automatically pull changes on startup and push on save</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={autoSync}
      aria-label="Auto Sync"
      onclick={toggleAutoSync}
      class="relative h-5 w-9 rounded-full transition-colors {autoSync ? 'bg-brand-600' : 'bg-surface-600'}"
    >
      <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform {autoSync ? 'translate-x-4' : 'translate-x-0'}"></span>
    </button>
  </div>

  <!-- Actions -->
  <div class="flex flex-wrap gap-2 pt-2">
    <button
      onclick={saveConfig}
      disabled={saving}
      class="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
    >
      {saving ? 'Saving...' : 'Save'}
    </button>
    <button
      onclick={testConnection}
      disabled={testing}
      class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-50"
    >
      {testing ? 'Testing...' : 'Test Connection'}
    </button>
    <button
      onclick={pullNow}
      disabled={pulling}
      class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-50"
    >
      {pulling ? 'Pulling...' : 'Pull Now'}
    </button>
    <button
      onclick={pushAll}
      disabled={pushing}
      class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-50"
    >
      {pushing ? 'Pushing...' : 'Push All'}
    </button>
  </div>

  <!-- Help -->
  <div class="rounded border border-surface-700 bg-surface-800/30 p-3 text-xs text-surface-500">
    <div class="mb-1 font-medium text-surface-400">How sync works</div>
    <ul class="list-inside list-disc space-y-0.5">
      <li>Collections are serialized to YAML and stored in your Git repository</li>
      <li>Enable sync per collection from its context menu in the sidebar</li>
      <li>Conflicts are detected automatically and resolved via a prompt</li>
      <li>Sensitive data (tokens, passwords) is flagged before pushing</li>
    </ul>
  </div>
</div>

{#if activeConflict}
  <ConflictModal
    collection={{ id: activeConflict.collectionId, name: activeConflict.collectionName }}
    onresolve={handleConflictResolve}
    onclose={() => { activeConflict = null }}
  />
{/if}
