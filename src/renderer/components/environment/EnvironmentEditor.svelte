<script lang="ts">
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import KeyValueEditor from '../shared/KeyValueEditor.svelte'
  import type { EnvironmentVariable } from '@shared/types/models'

  interface Props {
    tabId: string
    environmentId: string
  }

  let { tabId, environmentId }: Props = $props()

  let environment = $derived(environmentsStore.getById(environmentId))
  let name = $state('')
  let variables = $state<EnvironmentVariable[]>([])
  let initialized = $state(false)

  // Initialize from DB when environment changes
  $effect(() => {
    if (environment && !initialized) {
      name = environment.name
      try {
        variables = JSON.parse(environment.variables)
      } catch {
        variables = []
      }
      if (variables.length === 0) {
        variables = [{ key: '', value: '', enabled: true }]
      }
      initialized = true
    }
  })

  async function handleNameChange(newName: string): Promise<void> {
    name = newName
    appStore.updateTabLabel(tabId, newName)
    await environmentsStore.update(environmentId, { name: newName })
  }

  async function handleVariablesChange(entries: { key: string; value: string; enabled: boolean }[]): Promise<void> {
    const envVars: EnvironmentVariable[] = entries.map((e) => ({
      key: e.key,
      value: e.value,
      enabled: e.enabled,
    }))
    variables = envVars
    await environmentsStore.update(environmentId, { variables: JSON.stringify(envVars) })
  }

  async function toggleActive(): Promise<void> {
    if (!environment) return
    if (environment.is_active) {
      await environmentsStore.deactivate(environmentId)
    } else {
      await environmentsStore.activate(environmentId, appStore.activeWorkspaceId ?? undefined)
    }
  }

  // Vault sync
  let vaultConfigured = $state(false)
  let vaultSynced = $derived(environment?.vault_synced === 1)
  let vaultPulling = $state(false)
  let vaultPushing = $state(false)
  let vaultStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null)

  $effect(() => {
    checkVaultConfigured()
  })

  async function checkVaultConfigured(): Promise<void> {
    const url = await window.api.settings.get('vault.url')
    vaultConfigured = !!url
  }

  async function toggleVaultSync(): Promise<void> {
    if (!environment) return
    const newValue = vaultSynced ? 0 : 1
    await environmentsStore.update(environmentId, { vault_synced: newValue })
  }

  async function pullFromVault(): Promise<void> {
    vaultPulling = true
    vaultStatus = null
    try {
      const vars = await window.api.vault.fetchVariables(environmentId)
      variables = vars.length > 0 ? vars : [{ key: '', value: '', enabled: true }]
      await environmentsStore.update(environmentId, { variables: JSON.stringify(vars) })
      vaultStatus = { type: 'success', message: `Pulled ${vars.length} variables from Vault` }
    } catch (err) {
      vaultStatus = { type: 'error', message: err instanceof Error ? err.message : 'Pull failed' }
    } finally {
      vaultPulling = false
    }
  }

  async function pushToVault(): Promise<void> {
    vaultPushing = true
    vaultStatus = null
    try {
      const result = await window.api.vault.pushVariables(environmentId, variables)
      vaultStatus = result.success
        ? { type: 'success', message: 'Pushed variables to Vault' }
        : { type: 'error', message: result.message ?? 'Push failed' }
    } catch (err) {
      vaultStatus = { type: 'error', message: err instanceof Error ? err.message : 'Push failed' }
    } finally {
      vaultPushing = false
    }
  }
</script>

{#if environment}
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex shrink-0 items-center gap-3 border-b border-surface-700 px-4 py-3">
      <!-- Active toggle -->
      <button
        onclick={toggleActive}
        class="flex items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors
          {environment.is_active
            ? 'bg-green-500/15 text-green-400'
            : 'bg-surface-800 text-surface-400 hover:text-surface-200'}"
      >
        <span class="h-2 w-2 rounded-full {environment.is_active ? 'bg-green-400' : 'bg-surface-600'}"></span>
        {environment.is_active ? 'Active' : 'Inactive'}
      </button>

      <!-- Name input -->
      <input
        type="text"
        value={name}
        oninput={(e) => handleNameChange(e.currentTarget.value)}
        class="h-8 min-w-0 flex-1 rounded border border-surface-700 bg-surface-800/50 px-3 text-sm font-medium text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
        placeholder="Environment name"
      />
    </div>

    <!-- Variables editor -->
    <div class="flex-1 overflow-auto p-4">
      <div class="mb-2 text-xs font-medium uppercase text-surface-500">Variables</div>
      <KeyValueEditor
        entries={variables.map((v) => ({ key: v.key, value: v.value, enabled: v.enabled }))}
        onchange={handleVariablesChange}
        keyPlaceholder="Variable name"
        valuePlaceholder="Variable value"
      />

      <!-- Vault sync section -->
      {#if vaultConfigured}
        <div class="mt-6 rounded border border-surface-700 bg-surface-800/30 p-3">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="text-xs font-medium text-surface-300">Vault Sync</div>
              <div class="text-[10px] text-surface-500">Sync variables with HashiCorp Vault</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={vaultSynced}
              aria-label="Enable vault sync"
              onclick={toggleVaultSync}
              class="relative h-5 w-9 rounded-full transition-colors {vaultSynced ? 'bg-brand-600' : 'bg-surface-600'}"
            >
              <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform {vaultSynced ? 'translate-x-4' : 'translate-x-0'}"></span>
            </button>
          </div>

          {#if vaultSynced}
            {#if vaultStatus}
              <div class="mb-2 rounded px-2 py-1 text-[10px] {vaultStatus.type === 'success'
                ? 'bg-green-900/30 text-green-300'
                : 'bg-red-900/30 text-red-300'}">
                {vaultStatus.message}
              </div>
            {/if}
            <div class="flex gap-2">
              <button
                onclick={pullFromVault}
                disabled={vaultPulling}
                class="rounded border border-surface-600 px-2 py-1 text-[10px] text-surface-300 hover:bg-surface-700 disabled:opacity-50"
              >
                {vaultPulling ? 'Pulling...' : 'Pull from Vault'}
              </button>
              <button
                onclick={pushToVault}
                disabled={vaultPushing}
                class="rounded border border-surface-600 px-2 py-1 text-[10px] text-surface-300 hover:bg-surface-700 disabled:opacity-50"
              >
                {vaultPushing ? 'Pushing...' : 'Push to Vault'}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-surface-500">Environment not found</p>
  </div>
{/if}
