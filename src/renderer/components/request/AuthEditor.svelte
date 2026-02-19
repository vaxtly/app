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

<div class="ae-root">
  <!-- Type selector -->
  <div class="ae-types">
    {#each AUTH_TYPES as type}
      <button
        onclick={() => onchange({ ...auth, type })}
        class="ae-type"
        class:ae-type--active={auth.type === type}
      >
        {typeLabels[type]}
      </button>
    {/each}
  </div>

  <!-- Auth fields -->
  <div class="ae-content">
    {#if auth.type === 'none'}
      <p class="ae-hint">This request does not use authentication.</p>
    {:else if auth.type === 'bearer'}
      <div class="ae-fields">
        <div class="ae-field">
          <label for="auth-bearer-token" class="ae-label">Token</label>
          <input
            id="auth-bearer-token"
            type="text"
            value={auth.bearer_token ?? ''}
            oninput={(e) => updateField('bearer_token', e.currentTarget.value)}
            placeholder="Enter bearer token..."
            class="ae-input"
          />
        </div>
      </div>
    {:else if auth.type === 'basic'}
      <div class="ae-fields">
        <div class="ae-field">
          <label for="auth-basic-username" class="ae-label">Username</label>
          <input
            id="auth-basic-username"
            type="text"
            value={auth.basic_username ?? ''}
            oninput={(e) => updateField('basic_username', e.currentTarget.value)}
            placeholder="Username"
            class="ae-input"
          />
        </div>
        <div class="ae-field">
          <label for="auth-basic-password" class="ae-label">Password</label>
          <input
            id="auth-basic-password"
            type="password"
            value={auth.basic_password ?? ''}
            oninput={(e) => updateField('basic_password', e.currentTarget.value)}
            placeholder="Password"
            class="ae-input"
          />
        </div>
      </div>
    {:else if auth.type === 'api-key'}
      <div class="ae-fields">
        <div class="ae-field">
          <label for="auth-apikey-header" class="ae-label">Header Name</label>
          <input
            id="auth-apikey-header"
            type="text"
            value={auth.api_key_header ?? ''}
            oninput={(e) => updateField('api_key_header', e.currentTarget.value)}
            placeholder="X-API-Key"
            class="ae-input"
          />
        </div>
        <div class="ae-field">
          <label for="auth-apikey-value" class="ae-label">Value</label>
          <input
            id="auth-apikey-value"
            type="text"
            value={auth.api_key_value ?? ''}
            oninput={(e) => updateField('api_key_value', e.currentTarget.value)}
            placeholder="API key value"
            class="ae-input"
          />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ae-root {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* --- Type selector --- */
  .ae-types {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-surface-700);
  }

  .ae-type {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-surface-400);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }

  .ae-type:hover {
    color: var(--color-surface-200);
    background: color-mix(in srgb, var(--color-surface-700) 40%, transparent);
  }

  .ae-type--active {
    color: var(--color-brand-400);
    background: color-mix(in srgb, var(--color-brand-500) 12%, transparent);
    font-weight: 500;
  }

  .ae-type--active:hover {
    color: var(--color-brand-400);
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
  }

  /* --- Content --- */
  .ae-content {
    flex: 1;
    overflow: auto;
    padding: 12px;
  }

  .ae-hint {
    font-size: 12px;
    color: var(--color-surface-500);
    margin: 0;
  }

  .ae-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ae-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ae-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-surface-500);
  }

  .ae-input {
    height: 32px;
    width: 100%;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: var(--color-surface-800);
    color: var(--color-surface-100);
    font-size: 12px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.12s, background 0.12s;
  }

  .ae-input:hover {
    border-color: var(--color-surface-600);
  }

  .ae-input:focus {
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-brand-500) 15%, transparent);
  }

  .ae-input::placeholder {
    color: var(--color-surface-600);
  }
</style>
