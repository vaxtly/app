<script lang="ts">
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
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
  let isDirty = $state(false)
  let saving = $state(false)
  let initialized = $state(false)
  let lastEnvironmentId = $state('')

  // Reset when switching to a different environment
  $effect(() => {
    if (environmentId !== lastEnvironmentId) {
      lastEnvironmentId = environmentId
      initialized = false
      isDirty = false
    }
  })

  // Initialize from DB when environment changes, auto-fetch from Vault if synced and empty
  $effect(() => {
    if (environment && !initialized) {
      name = environment.name
      let parsed: EnvironmentVariable[] = []
      try {
        parsed = JSON.parse(environment.variables)
      } catch {
        parsed = []
      }

      if (parsed.length === 0 && environment.vault_synced === 1) {
        // Vault-synced but no local variables — fetch from Vault
        initialized = true
        fetchVaultVariablesOnLoad()
      } else {
        variables = parsed.length > 0 ? parsed : [{ key: '', value: '', enabled: true }]
        initialized = true
      }
    }
  })

  async function fetchVaultVariablesOnLoad(): Promise<void> {
    vaultPulling = true
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      const vars = await window.api.vault.fetchVariables(environmentId, wsId)
      variables = vars.length > 0 ? vars : [{ key: '', value: '', enabled: true }]
    } catch {
      variables = [{ key: '', value: '', enabled: true }]
    } finally {
      vaultPulling = false
    }
  }

  async function handleNameChange(newName: string): Promise<void> {
    name = newName
    appStore.updateTabLabel(tabId, newName)
    await environmentsStore.update(environmentId, { name: newName })
  }

  function handleVariablesChange(entries: { key: string; value: string; enabled: boolean }[]): void {
    variables = entries.map((e) => ({
      key: e.key,
      value: e.value,
      enabled: e.enabled,
    }))
    isDirty = true
  }

  async function save(): Promise<void> {
    saving = true
    vaultStatus = null
    try {
      if (vaultSynced) {
        // Vault-synced: push to Vault only, no local DB write for variables
        const wsId = appStore.activeWorkspaceId ?? undefined
        const result = await window.api.vault.pushVariables(environmentId, $state.snapshot(variables), wsId)
        isDirty = false
        vaultStatus = result.success
          ? { type: 'success', message: 'Pushed to Vault' }
          : { type: 'error', message: result.message ?? 'Vault push failed' }
      } else {
        await environmentsStore.update(environmentId, { variables: JSON.stringify($state.snapshot(variables)) })
        isDirty = false
      }
    } catch (err) {
      vaultStatus = { type: 'error', message: err instanceof Error ? err.message : 'Save failed' }
    } finally {
      saving = false
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (isDirty && !saving) save()
    }
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
  let vaultStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null)

  $effect(() => {
    checkVaultConfigured()
  })

  async function checkVaultConfigured(): Promise<void> {
    const wsId = appStore.activeWorkspaceId
    let url: string | undefined
    if (wsId) {
      url = await window.api.workspaceSettings.get(wsId, 'vault.url')
    }
    if (!url) {
      url = await window.api.settings.get('vault.url')
    }
    vaultConfigured = !!url
  }

  async function toggleVaultSync(): Promise<void> {
    if (!environment) return
    const newValue = vaultSynced ? 0 : 1
    // Both directions clear variables:
    // - Enabling: secrets move to vault, clear DB
    // - Disabling: don't leak vault secrets into DB, start with empty env
    await environmentsStore.update(environmentId, {
      vault_synced: newValue,
      variables: '[]',
    })
    // Reset the editor to an empty row
    variables = [{ key: '', value: '', enabled: true }]
    isDirty = false
  }

  async function pullFromVault(): Promise<void> {
    vaultPulling = true
    vaultStatus = null
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      const vars = await window.api.vault.fetchVariables(environmentId, wsId)
      variables = vars.length > 0 ? vars : [{ key: '', value: '', enabled: true }]
      isDirty = false
      vaultStatus = { type: 'success', message: `Pulled ${vars.length} variables from Vault` }
    } catch (err) {
      vaultStatus = { type: 'error', message: err instanceof Error ? err.message : 'Pull failed' }
    } finally {
      vaultPulling = false
    }
  }

</script>

{#if environment}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex h-full flex-col" onkeydown={handleKeydown}>
    <!-- Header bar (matches UrlBar pill style) -->
    <div class="flex shrink-0 items-center gap-2 px-3 py-2.5">
      <div class="env-bar-inner flex min-w-0 flex-1 items-center overflow-hidden rounded-xl transition-colors duration-150" style="border: 1px solid var(--glass-border); background: var(--tint-muted)">
        <!-- Active/Inactive toggle -->
        <button
          class="env-toggle-btn flex h-[38px] shrink-0 cursor-pointer items-center gap-2 border-0 border-r border-solid px-3.5 outline-none transition-all duration-150 {environment.is_active ? 'text-success' : 'text-surface-400'}"
          onclick={toggleActive}
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-200 {environment.is_active ? 'env-status-led--active bg-success' : 'bg-surface-600'}"></span>
          <span class="text-xs font-bold font-mono tracking-wide whitespace-nowrap" style="font-feature-settings: var(--font-feature-mono)">{environment.is_active ? 'Active' : 'Inactive'}</span>
        </button>

        <!-- Name input -->
        <input
          type="text"
          value={name}
          oninput={(e) => handleNameChange(e.currentTarget.value)}
          class="h-[38px] w-full border-none bg-transparent px-3 text-[13px] font-medium text-surface-100 outline-none placeholder:text-surface-500"
          placeholder="Environment name..."
        />

        <!-- Save button -->
        <button class="env-save flex h-[38px] shrink-0 cursor-default items-center gap-[7px] border-0 border-l border-solid bg-transparent pl-3.5 pr-4 text-surface-500 whitespace-nowrap transition-all duration-200 disabled:cursor-default disabled:opacity-40" style="border-color: var(--glass-border)" class:env-save--dirty={isDirty} disabled={!isDirty || saving} onclick={save}>
          {#if saving}
            <span class="env-save-spinner"></span>
            <span class="text-[11px] font-bold font-mono tracking-widest uppercase" style="font-feature-settings: var(--font-feature-mono)">{vaultSynced ? 'Pushing...' : 'Saving...'}</span>
          {:else}
            <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-[11px] font-bold font-mono tracking-widest uppercase" style="font-feature-settings: var(--font-feature-mono)">Save{#if isDirty && vaultSynced}&ensp;&middot;&ensp;Vault{/if}</span>
          {/if}
        </button>
      </div>
    </div>

    <!-- Variables editor -->
    <div class="flex-1 overflow-auto p-4">
      <!-- Vault sync section -->
      {#if vaultConfigured}
        <div class="mb-4 rounded-lg p-3" style="border: 1px solid var(--glass-border); background: var(--tint-subtle)">
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
              class="relative h-5 w-9 rounded-full transition-colors {vaultSynced ? 'bg-brand-600' : 'bg-[var(--tint-bold)]'}"
            >
              <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform {vaultSynced ? 'translate-x-4' : 'translate-x-0'}"></span>
            </button>
          </div>

          {#if vaultSynced}
            {#if vaultStatus}
              <div class="mb-2 rounded-md px-2 py-1 text-[10px]"
                style={`color: var(${vaultStatus.type === 'success' ? '--color-success' : '--color-danger'}); background: color-mix(in srgb, var(${vaultStatus.type === 'success' ? '--color-success' : '--color-danger'}) 12%, transparent)`}>
                {vaultStatus.message}
              </div>
            {/if}
            <div class="flex gap-2">
              <button
                onclick={pullFromVault}
                disabled={vaultPulling}
                class="rounded-md px-2 py-1 text-[10px] text-surface-300 hover:bg-[var(--tint-active)] disabled:opacity-50"
                style="border: 1px solid var(--glass-border)"
              >
                {vaultPulling ? 'Pulling...' : 'Pull from Vault'}
              </button>
            </div>
            <div class="mt-1 text-[10px] text-surface-500">Save will automatically push to Vault.</div>
          {/if}
        </div>
      {/if}

      <div class="mb-2 text-xs font-medium uppercase text-surface-500">Variables</div>
      <KeyValueEditor
        entries={variables.map((v) => ({ key: v.key, value: v.value, enabled: v.enabled }))}
        onchange={handleVariablesChange}
        keyPlaceholder="Variable name"
        valuePlaceholder="Variable value"
      />
    </div>
  </div>
{:else}
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-surface-500">Environment not found</p>
  </div>
{/if}

<style>
  .env-bar-inner:focus-within {
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-brand-500) 20%, transparent);
  }

  .env-status-led--active {
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-success) 50%, transparent);
  }

  .env-toggle-btn {
    border-color: var(--glass-border);
    background: var(--tint-subtle);
  }

  .env-toggle-btn:hover {
    background: var(--tint-active);
  }

  .env-save--dirty {
    background: color-mix(in srgb, var(--color-success) 10%, transparent);
    color: var(--color-success);
    border-left-color: color-mix(in srgb, var(--color-success) 20%, transparent);
    cursor: pointer;
  }

  .env-save--dirty:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-success) 20%, transparent);
  }

  .env-save--dirty:active:not(:disabled) {
    background: color-mix(in srgb, var(--color-success) 28%, transparent);
  }

  .env-save-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--color-success) 25%, transparent);
    border-top-color: var(--color-success);
    animation: spin-360 0.6s linear infinite;
    flex-shrink: 0;
  }
</style>
