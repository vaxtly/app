<script lang="ts">
  import { AUTH_TYPES } from '../../../shared/constants'
  import type { AuthConfig } from '../../lib/types'

  interface Props {
    auth: AuthConfig
    onchange: (auth: AuthConfig) => void
  }

  let { auth, onchange }: Props = $props()

  const typeLabels: Record<string, string> = {
    none: 'No Auth',
    bearer: 'Bearer Token',
    basic: 'Basic Auth',
    'api-key': 'API Key',
  }

  function updateField(field: keyof AuthConfig, value: string): void {
    onchange({ ...auth, [field]: value })
  }
</script>

<div class="flex h-full flex-col">
  <!-- Type selector -->
  <div class="flex shrink-0 items-center gap-2 border-b border-surface-700 px-3 py-2">
    {#each AUTH_TYPES as type}
      <button
        onclick={() => onchange({ ...auth, type })}
        class="rounded px-2 py-0.5 text-xs transition-colors {auth.type === type ? 'bg-brand-500/15 text-brand-400 font-medium' : 'text-surface-400 hover:text-surface-200'}"
      >
        {typeLabels[type]}
      </button>
    {/each}
  </div>

  <!-- Auth fields -->
  <div class="flex-1 overflow-auto p-3">
    {#if auth.type === 'none'}
      <p class="text-xs text-surface-500">This request does not use authentication.</p>
    {:else if auth.type === 'bearer'}
      <div class="space-y-3">
        <div>
          <label for="auth-bearer-token" class="mb-1 block text-[10px] font-medium uppercase text-surface-500">Token</label>
          <input
            id="auth-bearer-token"
            type="text"
            value={auth.bearer_token ?? ''}
            oninput={(e) => updateField('bearer_token', e.currentTarget.value)}
            placeholder="Enter bearer token..."
            class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>
    {:else if auth.type === 'basic'}
      <div class="space-y-3">
        <div>
          <label for="auth-basic-username" class="mb-1 block text-[10px] font-medium uppercase text-surface-500">Username</label>
          <input
            id="auth-basic-username"
            type="text"
            value={auth.basic_username ?? ''}
            oninput={(e) => updateField('basic_username', e.currentTarget.value)}
            placeholder="Username"
            class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label for="auth-basic-password" class="mb-1 block text-[10px] font-medium uppercase text-surface-500">Password</label>
          <input
            id="auth-basic-password"
            type="password"
            value={auth.basic_password ?? ''}
            oninput={(e) => updateField('basic_password', e.currentTarget.value)}
            placeholder="Password"
            class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>
    {:else if auth.type === 'api-key'}
      <div class="space-y-3">
        <div>
          <label for="auth-apikey-header" class="mb-1 block text-[10px] font-medium uppercase text-surface-500">Header Name</label>
          <input
            id="auth-apikey-header"
            type="text"
            value={auth.api_key_header ?? ''}
            oninput={(e) => updateField('api_key_header', e.currentTarget.value)}
            placeholder="X-API-Key"
            class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label for="auth-apikey-value" class="mb-1 block text-[10px] font-medium uppercase text-surface-500">Value</label>
          <input
            id="auth-apikey-value"
            type="text"
            value={auth.api_key_value ?? ''}
            oninput={(e) => updateField('api_key_value', e.currentTarget.value)}
            placeholder="API key value"
            class="h-8 w-full rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 placeholder-surface-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>
    {/if}
  </div>
</div>
