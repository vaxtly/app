<script lang="ts">
  import { appStore } from '../../lib/stores/app.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'

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
  let pushing = $state(false)
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

  async function pushAll(): Promise<void> {
    pushing = true
    status = null
    try {
      const result = await window.api.vault.pull()
      status = result.success
        ? { type: 'success', message: result.message || 'Push complete' }
        : { type: 'error', message: result.message || 'Push failed' }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Push failed' }
    } finally {
      pushing = false
    }
  }

  function toggleSsl(): void {
    verifySsl = !verifySsl
  }

  function toggleAutoSync(): void {
    autoSync = !autoSync
  }
</script>

<div class="space-y-4">
  {#if status}
    <div class="rounded border px-3 py-2 text-xs {status.type === 'success'
      ? 'border-green-800 bg-green-900/30 text-green-300'
      : 'border-red-800 bg-red-900/30 text-red-300'}">
      {status.message}
    </div>
  {/if}

  <!-- URL -->
  <div>
    <div class="mb-1 text-sm text-surface-200">Vault URL</div>
    <input
      type="text"
      value={url}
      oninput={(e) => { url = (e.target as HTMLInputElement).value }}
      placeholder="https://vault.example.com"
      class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
    />
  </div>

  <!-- Auth Method -->
  <div class="flex items-center justify-between py-1">
    <div>
      <div class="text-sm text-surface-200">Authentication Method</div>
    </div>
    <select
      value={authMethod}
      onchange={(e) => { authMethod = (e.target as HTMLSelectElement).value as 'token' | 'approle' }}
      class="h-7 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 focus:border-brand-500 focus:outline-none"
    >
      <option value="token">Token</option>
      <option value="approle">AppRole</option>
    </select>
  </div>

  <!-- Conditional auth fields -->
  {#if authMethod === 'token'}
    <div>
      <div class="mb-1 text-sm text-surface-200">Token</div>
      <input
        type="password"
        value={token}
        oninput={(e) => { token = (e.target as HTMLInputElement).value }}
        placeholder="hvs...."
        class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
      />
    </div>
  {:else}
    <div>
      <div class="mb-1 text-sm text-surface-200">Role ID</div>
      <input
        type="text"
        value={roleId}
        oninput={(e) => { roleId = (e.target as HTMLInputElement).value }}
        class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
      />
    </div>
    <div>
      <div class="mb-1 text-sm text-surface-200">Secret ID</div>
      <input
        type="password"
        value={secretId}
        oninput={(e) => { secretId = (e.target as HTMLInputElement).value }}
        class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
      />
    </div>
  {/if}

  <!-- Namespace -->
  <div>
    <div class="mb-1 text-sm text-surface-200">Namespace</div>
    <input
      type="text"
      value={namespace}
      oninput={(e) => { namespace = (e.target as HTMLInputElement).value }}
      placeholder="Optional"
      class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
    />
  </div>

  <!-- Engine Path -->
  <div>
    <div class="mb-1 text-sm text-surface-200">Secrets Engine Path</div>
    <input
      type="text"
      value={enginePath}
      oninput={(e) => { enginePath = (e.target as HTMLInputElement).value }}
      placeholder="secret"
      class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
    />
  </div>

  <!-- Verify SSL -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">Verify SSL</div>
      <div class="text-xs text-surface-500">Verify the Vault server's SSL certificate</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={verifySsl}
      aria-label="Verify SSL"
      onclick={toggleSsl}
      class="relative h-5 w-9 rounded-full transition-colors {verifySsl ? 'bg-brand-600' : 'bg-surface-600'}"
    >
      <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform {verifySsl ? 'translate-x-4' : 'translate-x-0'}"></span>
    </button>
  </div>

  <!-- Auto Sync -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">Auto Sync</div>
      <div class="text-xs text-surface-500">Automatically sync vault secrets on startup</div>
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
      onclick={pullFromVault}
      disabled={pulling}
      class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-50"
    >
      {pulling ? 'Pulling...' : 'Pull from Vault'}
    </button>
    <button
      onclick={pushAll}
      disabled={pushing}
      class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-50"
    >
      {pushing ? 'Pushing...' : 'Push All'}
    </button>
  </div>
</div>
