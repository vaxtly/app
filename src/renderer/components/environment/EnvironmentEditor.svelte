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
      if (vars.length > 0) {
        await environmentsStore.update(environmentId, { variables: JSON.stringify(vars) })
      }
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
      await environmentsStore.update(environmentId, { variables: JSON.stringify($state.snapshot(variables)) })
      isDirty = false

      if (vaultSynced) {
        const wsId = appStore.activeWorkspaceId ?? undefined
        const result = await window.api.vault.pushVariables(environmentId, $state.snapshot(variables), wsId)
        vaultStatus = result.success
          ? { type: 'success', message: 'Saved and pushed to Vault' }
          : { type: 'error', message: result.message ?? 'Saved locally, but Vault push failed' }
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
    await environmentsStore.update(environmentId, { vault_synced: newValue })
  }

  async function pullFromVault(): Promise<void> {
    vaultPulling = true
    vaultStatus = null
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      const vars = await window.api.vault.fetchVariables(environmentId, wsId)
      variables = vars.length > 0 ? vars : [{ key: '', value: '', enabled: true }]
      await environmentsStore.update(environmentId, { variables: JSON.stringify(vars) })
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
    <div class="env-bar">
      <div class="env-bar-inner">
        <!-- Active/Inactive toggle -->
        <button class="env-status" class:env-status--active={environment.is_active} onclick={toggleActive}>
          <span class="env-status-led" class:env-status-led--active={environment.is_active}></span>
          <span class="env-status-text">{environment.is_active ? 'Active' : 'Inactive'}</span>
        </button>

        <!-- Name input -->
        <input
          type="text"
          value={name}
          oninput={(e) => handleNameChange(e.currentTarget.value)}
          class="env-name-input"
          placeholder="Environment name..."
        />

        <!-- Save button -->
        <button class="env-save" class:env-save--dirty={isDirty} disabled={!isDirty || saving} onclick={save}>
          {#if saving}
            <span class="env-save-spinner"></span>
            <span class="env-save-label">{vaultSynced ? 'Pushing...' : 'Saving...'}</span>
          {:else}
            <svg class="env-save-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
            <span class="env-save-label">Save{#if isDirty && vaultSynced}&ensp;&middot;&ensp;Vault{/if}</span>
          {/if}
        </button>
      </div>
    </div>

    <!-- Variables editor -->
    <div class="flex-1 overflow-auto p-4">
      <!-- Vault sync section -->
      {#if vaultConfigured}
        <div class="mb-4 rounded border border-surface-700 bg-surface-800/30 p-3">
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
              <div class="mb-2 rounded px-2 py-1 text-[10px]"
                style={`color: var(${vaultStatus.type === 'success' ? '--color-success' : '--color-danger'}); background: color-mix(in srgb, var(${vaultStatus.type === 'success' ? '--color-success' : '--color-danger'}) 12%, transparent)`}>
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
  .env-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    flex-shrink: 0;
  }

  .env-bar-inner {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    background: var(--color-surface-800);
    border: 1px solid var(--color-surface-600);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .env-bar-inner:focus-within {
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-brand-500) 20%, transparent);
  }

  /* --- Status toggle (like method selector) --- */
  .env-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 38px;
    border: none;
    border-right: 1px solid var(--color-surface-600);
    background: color-mix(in srgb, var(--color-surface-900) 50%, transparent);
    color: var(--color-surface-400);
    cursor: pointer;
    outline: none;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }

  .env-status:hover {
    background: color-mix(in srgb, var(--color-surface-700) 50%, transparent);
  }

  .env-status--active {
    color: var(--color-success);
  }

  .env-status-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-surface-600);
    flex-shrink: 0;
    transition: background 0.2s, box-shadow 0.2s;
  }

  .env-status-led--active {
    background: var(--color-success);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-success) 50%, transparent);
  }

  .env-status-text {
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  /* --- Name input (like URL input) --- */
  .env-name-input {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border: none;
    background: transparent;
    color: var(--color-surface-100);
    font-size: 13px;
    font-weight: 500;
    outline: none;
  }

  .env-name-input::placeholder {
    color: var(--color-surface-500);
  }

  /* --- Save button (like send button) --- */
  .env-save {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 16px 0 14px;
    height: 38px;
    border: none;
    border-left: 1px solid var(--color-surface-600);
    background: transparent;
    color: var(--color-surface-500);
    cursor: default;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .env-save:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .env-save--dirty {
    background: color-mix(in srgb, var(--color-success) 10%, transparent);
    color: var(--color-success);
    border-left-color: color-mix(in srgb, var(--color-success) 20%, var(--color-surface-600));
    cursor: pointer;
  }

  .env-save--dirty:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-success) 20%, transparent);
  }

  .env-save--dirty:active:not(:disabled) {
    background: color-mix(in srgb, var(--color-success) 28%, transparent);
  }

  .env-save-icon {
    flex-shrink: 0;
  }

  .env-save-label {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .env-save-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--color-success) 25%, transparent);
    border-top-color: var(--color-success);
    animation: env-spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes env-spin {
    to { transform: rotate(360deg); }
  }
</style>
