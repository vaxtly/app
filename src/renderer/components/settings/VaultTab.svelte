<script lang="ts">
  import { appStore } from '../../lib/stores/app.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'
  import Toggle from '../shared/Toggle.svelte'

  let url = $state('')
  let authMethod = $state<'token' | 'approle'>('token')
  let token = $state('')
  let roleId = $state('')
  let secretId = $state('')
  let namespace = $state('')
  let enginePath = $state('secret')
  let verifySsl = $state(true)
  let autoSync = $state(false)

  let testing = $state(false)
  let pulling = $state(false)
  let saving = $state(false)
  let status = $state<{ type: 'success' | 'error'; message: string } | null>(null)

  $effect(() => {
    loadConfig()
  })

  async function loadConfig(): Promise<void> {
    const [u, am, t, ri, si, ns, ep, vs, as_] = await Promise.all([
      window.api.settings.get('vault.url'),
      window.api.settings.get('vault.auth_method'),
      window.api.settings.get('vault.token'),
      window.api.settings.get('vault.role_id'),
      window.api.settings.get('vault.secret_id'),
      window.api.settings.get('vault.namespace'),
      window.api.settings.get('vault.mount'),
      window.api.settings.get('vault.verify_ssl'),
      window.api.settings.get('vault.auto_sync'),
    ])
    if (u) url = u
    if (am === 'token' || am === 'approle') authMethod = am
    if (t) token = t
    if (ri) roleId = ri
    if (si) secretId = si
    if (ns) namespace = ns
    if (ep) enginePath = ep
    verifySsl = vs !== 'false' && vs !== '0'
    autoSync = as_ === 'true' || as_ === '1'
  }

  async function saveConfig(): Promise<void> {
    saving = true
    status = null
    try {
      await Promise.all([
        window.api.settings.set('vault.provider', 'hashicorp'),
        window.api.settings.set('vault.url', url),
        window.api.settings.set('vault.auth_method', authMethod),
        window.api.settings.set('vault.token', token),
        window.api.settings.set('vault.role_id', roleId),
        window.api.settings.set('vault.secret_id', secretId),
        window.api.settings.set('vault.namespace', namespace),
        window.api.settings.set('vault.mount', enginePath),
        window.api.settings.set('vault.verify_ssl', String(verifySsl)),
        window.api.settings.set('vault.auto_sync', String(autoSync)),
      ])
      status = { type: 'success', message: 'Vault configuration saved' }
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
      const result = await window.api.vault.testConnection()
      status = result.success
        ? { type: 'success', message: result.message || 'Connection successful' }
        : { type: 'error', message: result.message || 'Connection failed' }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Connection failed' }
    } finally {
      testing = false
    }
  }

  async function pullFromVault(): Promise<void> {
    pulling = true
    status = null
    try {
      const result = await window.api.vault.pullAll(appStore.activeWorkspaceId ?? undefined)
      if (result.success) {
        await environmentsStore.loadAll(appStore.activeWorkspaceId ?? undefined)
        status = { type: 'success', message: `Pulled ${result.created} environments` }
      } else {
        status = { type: 'error', message: result.errors.join(', ') || 'Pull failed' }
      }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Pull failed' }
    } finally {
      pulling = false
    }
  }

  function toggleSsl(value: boolean): void {
    verifySsl = value
  }

  function toggleAutoSync(value: boolean): void {
    autoSync = value
  }

  function clearStatus(): void {
    status = null
  }
</script>

<div class="vault-tab">
  <!-- Status banner -->
  {#if status}
    <button class="status-banner" class:is-success={status.type === 'success'} class:is-error={status.type === 'error'} onclick={clearStatus}>
      <div class="status-icon">
        {#if status.type === 'success'}
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M8 5V8.5M8 11H8.005" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        {/if}
      </div>
      <span class="status-text">{status.message}</span>
      <svg class="status-dismiss" viewBox="0 0 12 12" fill="none">
        <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
  {/if}

  <!-- Server section -->
  <section class="section">
    <div class="section-header">
      <div class="section-icon vault-icon">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M9 11V12.5M5 15H13C13.828 15 14.5 14.328 14.5 13.5V9C14.5 8.172 13.828 7.5 13 7.5H5C4.172 7.5 3.5 8.172 3.5 9V13.5C3.5 14.328 4.172 15 5 15Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 7.5V5.5C6 3.843 7.343 2.5 9 2.5C10.657 2.5 12 3.843 12 5.5V7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="section-title">HashiCorp Vault</div>
        <div class="section-subtitle">Secrets management for environment variables</div>
      </div>
    </div>

    <!-- URL -->
    <div class="field-group">
      <span class="field-label">Vault URL</span>
      <input
        type="text"
        value={url}
        oninput={(e) => { url = (e.target as HTMLInputElement).value }}
        placeholder="https://vault.example.com"
        class="text-input"
      />
    </div>

    <!-- Auth Method -->
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Authentication</span>
      </div>
      <div class="auth-picker">
        <button
          class="auth-option"
          class:is-active={authMethod === 'token'}
          onclick={() => { authMethod = 'token' }}
        >Token</button>
        <button
          class="auth-option"
          class:is-active={authMethod === 'approle'}
          onclick={() => { authMethod = 'approle' }}
        >AppRole</button>
      </div>
    </div>

    <!-- Conditional auth fields -->
    {#if authMethod === 'token'}
      <div class="field-group">
        <span class="field-label">Token</span>
        <input
          type="password"
          value={token}
          oninput={(e) => { token = (e.target as HTMLInputElement).value }}
          placeholder="hvs...."
          class="text-input"
        />
      </div>
    {:else}
      <div class="field-row">
        <div class="field-group">
          <span class="field-label">Role ID</span>
          <input
            type="text"
            value={roleId}
            oninput={(e) => { roleId = (e.target as HTMLInputElement).value }}
            class="text-input"
          />
        </div>
        <div class="field-group">
          <span class="field-label">Secret ID</span>
          <input
            type="password"
            value={secretId}
            oninput={(e) => { secretId = (e.target as HTMLInputElement).value }}
            class="text-input"
          />
        </div>
      </div>
    {/if}

    <!-- Namespace + Engine Path side by side -->
    <div class="field-row">
      <div class="field-group">
        <span class="field-label">Namespace</span>
        <input
          type="text"
          value={namespace}
          oninput={(e) => { namespace = (e.target as HTMLInputElement).value }}
          placeholder="Optional"
          class="text-input"
        />
      </div>
      <div class="field-group">
        <span class="field-label">Engine Path</span>
        <input
          type="text"
          value={enginePath}
          oninput={(e) => { enginePath = (e.target as HTMLInputElement).value }}
          placeholder="secret"
          class="text-input"
        />
      </div>
    </div>

    <!-- Toggles -->
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Verify SSL</span>
        <span class="setting-desc">Validate server certificate</span>
      </div>
      <Toggle checked={verifySsl} onchange={toggleSsl} />
    </div>

    <div class="setting-row last">
      <div class="setting-info">
        <span class="setting-label">Auto Sync</span>
        <span class="setting-desc">Sync vault secrets on startup</span>
      </div>
      <Toggle checked={autoSync} onchange={toggleAutoSync} />
    </div>
  </section>

  <!-- Actions -->
  <div class="actions">
    <button class="action-btn primary" onclick={saveConfig} disabled={saving}>
      {#if saving}<span class="spinner"></span>{/if}
      {saving ? 'Saving...' : 'Save'}
    </button>
    <button class="action-btn secondary" onclick={testConnection} disabled={testing}>
      {#if testing}<span class="spinner"></span>{/if}
      {testing ? 'Testing...' : 'Test Connection'}
    </button>
    <div class="action-spacer"></div>
    <button class="action-btn secondary" onclick={pullFromVault} disabled={pulling}>
      {#if pulling}<span class="spinner"></span>{/if}
      <svg viewBox="0 0 14 14" fill="none" class="btn-icon">
        <path d="M7 2V12M7 12L3.5 8.5M7 12L10.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      {pulling ? 'Pulling...' : 'Pull All'}
    </button>
  </div>
</div>

<style>
  .vault-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Status banner */
  .status-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid;
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    transition: opacity 0.15s;
    animation: slideIn 0.2s ease-out;
  }
  .status-banner:hover { opacity: 0.85; }
  .status-banner.is-success {
    border-color: color-mix(in srgb, #4ade80 25%, transparent);
    background: color-mix(in srgb, #4ade80 8%, transparent);
    color: #86efac;
  }
  .status-banner.is-error {
    border-color: color-mix(in srgb, #f87171 25%, transparent);
    background: color-mix(in srgb, #f87171 8%, transparent);
    color: #fca5a5;
  }
  .status-icon { flex-shrink: 0; width: 16px; height: 16px; }
  .status-icon svg { width: 16px; height: 16px; }
  .status-text { flex: 1; min-width: 0; }
  .status-dismiss { flex-shrink: 0; width: 12px; height: 12px; opacity: 0.4; }
  .status-banner:hover .status-dismiss { opacity: 0.8; }

  /* Sections */
  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .section-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .section-icon svg { width: 16px; height: 16px; }
  .vault-icon {
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    color: #fbbf24;
  }
  .section-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-surface-200);
    line-height: 1.2;
  }
  .section-subtitle {
    font-size: 11px;
    color: var(--color-surface-500);
    line-height: 1.3;
  }

  /* Setting rows */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--color-surface-700);
  }
  .setting-row.last { border-bottom: none; }
  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .setting-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-surface-200);
  }
  .setting-desc {
    font-size: 11px;
    color: var(--color-surface-500);
  }

  /* Auth method picker */
  .auth-picker {
    display: flex;
    gap: 0;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--color-surface-700);
  }
  .auth-option {
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 500;
    color: var(--color-surface-400);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .auth-option:first-child {
    border-right: 1px solid var(--color-surface-700);
  }
  .auth-option:hover {
    color: var(--color-surface-300);
    background: var(--color-surface-800);
  }
  .auth-option.is-active {
    background: color-mix(in srgb, var(--color-brand-500) 12%, transparent);
    color: var(--color-brand-300);
  }

  /* Field groups */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .field-row {
    display: flex;
    gap: 10px;
  }
  .field-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-surface-200);
  }
  .text-input {
    height: 32px;
    width: 100%;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--color-surface-700);
    background: var(--color-surface-800);
    color: var(--color-surface-100);
    font-size: 12px;
    outline: none;
    transition: border-color 0.12s;
  }
  .text-input::placeholder {
    color: var(--color-surface-500);
  }
  .text-input:focus {
    border-color: var(--color-brand-500);
  }

  /* Actions */
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .action-spacer {
    flex: 1;
    min-width: 8px;
  }
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
    border: none;
  }
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .action-btn.primary {
    background: var(--color-brand-600);
    color: white;
  }
  .action-btn.primary:not(:disabled):hover {
    background: var(--color-brand-500);
  }
  .action-btn.secondary {
    background: transparent;
    border: 1px solid var(--color-surface-600);
    color: var(--color-surface-300);
  }
  .action-btn.secondary:not(:disabled):hover {
    background: var(--color-surface-800);
    border-color: var(--color-surface-500);
    color: var(--color-surface-200);
  }
  .btn-icon {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  /* Spinner */
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid color-mix(in srgb, currentColor 25%, transparent);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
