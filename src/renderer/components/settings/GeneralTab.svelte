<script lang="ts">
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import Toggle from '../shared/Toggle.svelte'

  let theme = $derived(settingsStore.get('app.theme'))
  let layout = $derived(settingsStore.get('request.layout'))
  let timeout = $derived(settingsStore.get('request.timeout'))
  let verifySsl = $derived(settingsStore.get('request.verify_ssl'))
  let followRedirects = $derived(settingsStore.get('request.follow_redirects'))
  let appVersion = $derived(settingsStore.get('app.version'))

  let updateStatus: 'idle' | 'checking' | 'available' | 'up-to-date' | 'error' = $state('idle')
  let availableVersion = $state('')

  async function handleCheckUpdates(): Promise<void> {
    updateStatus = 'checking'
    const cleanups = [
      window.api.on.updateAvailable((data) => {
        updateStatus = 'available'
        availableVersion = data.version
        dispose()
      }),
      window.api.on.updateError(() => {
        updateStatus = 'error'
        dispose()
      }),
    ]
    function dispose(): void {
      cleanups.forEach((fn) => fn())
    }

    // Timeout: if no event within 15s, assume up-to-date
    const timer = setTimeout(() => {
      if (updateStatus === 'checking') {
        updateStatus = 'up-to-date'
        dispose()
      }
    }, 15000)
    cleanups.push(() => clearTimeout(timer))

    await window.api.updater.check()
  }

  function handleThemeChange(value: 'dark' | 'light' | 'system'): void {
    settingsStore.set('app.theme', value)
  }

  function handleLayoutChange(value: 'rows' | 'columns'): void {
    settingsStore.set('request.layout', value)
  }

  function handleTimeoutChange(e: Event): void {
    const value = Math.max(1, Math.min(300, Number((e.target as HTMLInputElement).value) || 30))
    settingsStore.set('request.timeout', value)
  }

  function toggleSsl(value: boolean): void {
    settingsStore.set('request.verify_ssl', value)
  }

  function toggleRedirects(value: boolean): void {
    settingsStore.set('request.follow_redirects', value)
  }
</script>

<div class="general-tab">
  <!-- Appearance section -->
  <section class="section">
    <div class="section-header">
      <div class="section-icon appearance-icon">
        <svg viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M9 2.5V9L13 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="section-title">Appearance</div>
        <div class="section-subtitle">Color theme for the interface</div>
      </div>
    </div>

    <div class="setting-row last">
      <div class="setting-info">
        <span class="setting-label">Theme</span>
        <span class="setting-desc">Choose light, dark, or follow your system</span>
      </div>
      <div class="theme-picker">
        <button
          class="theme-option"
          class:is-active={theme === 'light'}
          onclick={() => handleThemeChange('light')}
          title="Light"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="10" cy="10" r="3.5"/>
            <path d="M10 3V4.5M10 15.5V17M17 10H15.5M4.5 10H3M14.95 5.05L13.89 6.11M6.11 13.89L5.05 14.95M14.95 14.95L13.89 13.89M6.11 6.11L5.05 5.05"/>
          </svg>
        </button>
        <button
          class="theme-option"
          class:is-active={theme === 'dark'}
          onclick={() => handleThemeChange('dark')}
          title="Dark"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M17 11.36A7.5 7.5 0 118.64 3 5.5 5.5 0 0017 11.36z"/>
          </svg>
        </button>
        <button
          class="theme-option"
          class:is-active={theme === 'system'}
          onclick={() => handleThemeChange('system')}
          title="System"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="14" height="10" rx="1.5"/>
            <path d="M7 16h6M10 13v3"/>
          </svg>
        </button>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <!-- HTTP section -->
  <section class="section">
    <div class="section-header">
      <div class="section-icon http-icon">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M3 9H15M15 9L11 5M15 9L11 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="section-title">Requests</div>
        <div class="section-subtitle">HTTP client behavior and defaults</div>
      </div>
    </div>

    <!-- Layout picker -->
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Layout</span>
        <span class="setting-desc">How request and response panels are arranged</span>
      </div>
      <div class="layout-picker">
        <button
          class="layout-option"
          class:is-active={layout === 'rows'}
          onclick={() => handleLayoutChange('rows')}
          title="Top / Bottom"
        >
          <svg viewBox="0 0 28 20" fill="none">
            <rect x="1" y="1" width="26" height="8" rx="1.5" stroke="currentColor" stroke-width="1"/>
            <rect x="1" y="11" width="26" height="8" rx="1.5" stroke="currentColor" stroke-width="1"/>
          </svg>
        </button>
        <button
          class="layout-option"
          class:is-active={layout === 'columns'}
          onclick={() => handleLayoutChange('columns')}
          title="Side by Side"
        >
          <svg viewBox="0 0 28 20" fill="none">
            <rect x="1" y="1" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1"/>
            <rect x="15" y="1" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Timeout -->
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Timeout</span>
        <span class="setting-desc">Maximum time to wait for a response</span>
      </div>
      <div class="timeout-input">
        <input
          type="number"
          value={timeout}
          onchange={handleTimeoutChange}
          min="1"
          max="300"
          class="num-input"
        />
        <span class="input-suffix">sec</span>
      </div>
    </div>

    <!-- Verify SSL -->
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Verify SSL</span>
        <span class="setting-desc">Reject invalid or self-signed certificates</span>
      </div>
      <Toggle checked={verifySsl} onchange={toggleSsl} />
    </div>

    <!-- Follow Redirects -->
    <div class="setting-row last">
      <div class="setting-info">
        <span class="setting-label">Follow Redirects</span>
        <span class="setting-desc">Automatically follow 3xx responses</span>
      </div>
      <Toggle checked={followRedirects} onchange={toggleRedirects} />
    </div>
  </section>

  <div class="divider"></div>

  <!-- About -->
  <section class="about">
    <div class="about-card">
      <div class="about-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div class="about-info">
        <span class="about-name">Vaxtly</span>
        <span class="about-version">Version {appVersion}</span>
      </div>
      <div class="about-actions">
        {#if updateStatus === 'checking'}
          <span class="update-status">Checking…</span>
        {:else if updateStatus === 'available'}
          <span class="update-status update-found">v{availableVersion} available</span>
        {:else if updateStatus === 'up-to-date'}
          <span class="update-status update-ok">Up to date</span>
        {:else if updateStatus === 'error'}
          <span class="update-status update-err">Check failed</span>
        {:else}
          <button class="check-update-btn" onclick={handleCheckUpdates}>Check for updates</button>
        {/if}
      </div>
    </div>
  </section>
</div>

<style>
  .general-tab {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Sections */
  .section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
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
  .section-icon svg {
    width: 16px;
    height: 16px;
  }
  .appearance-icon {
    background: color-mix(in srgb, var(--color-purple) 15%, transparent);
    color: var(--color-purple);
  }
  .http-icon {
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
    color: var(--color-brand-400);
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
    border-bottom: 1px solid var(--border-default);
  }
  .setting-row.last {
    border-bottom: none;
  }
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

  /* Layout picker */
  .layout-picker {
    display: flex;
    gap: 4px;
  }
  .layout-option {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--color-surface-500);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .layout-option:hover {
    border-color: var(--glass-border);
    background: var(--tint-subtle);
    color: var(--color-surface-300);
  }
  .layout-option.is-active {
    border-color: color-mix(in srgb, var(--color-brand-500) 50%, transparent);
    background: color-mix(in srgb, var(--color-brand-500) 8%, transparent);
    color: var(--color-brand-400);
  }
  .layout-option svg {
    width: 24px;
    height: 18px;
  }

  /* Theme picker */
  .theme-picker {
    display: flex;
    gap: 4px;
  }
  .theme-option {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--color-surface-500);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .theme-option:hover {
    border-color: var(--glass-border);
    background: var(--tint-subtle);
    color: var(--color-surface-300);
  }
  .theme-option.is-active {
    border-color: color-mix(in srgb, var(--color-brand-500) 50%, transparent);
    background: color-mix(in srgb, var(--color-brand-500) 8%, transparent);
    color: var(--color-brand-400);
  }
  .theme-option svg {
    width: 16px;
    height: 16px;
  }

  /* Inputs */
  .timeout-input {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .num-input {
    width: 56px;
    height: 28px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--tint-muted);
    color: var(--color-surface-100);
    font-size: 12px;
    text-align: right;
    outline: none;
    transition: border-color 0.12s;
    -moz-appearance: textfield;
  }
  .num-input::-webkit-inner-spin-button,
  .num-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .num-input:focus {
    border-color: var(--color-brand-500);
  }
  .input-suffix {
    font-size: 11px;
    color: var(--color-surface-500);
  }
  /* Divider */
  .divider {
    height: 1px;
    background: var(--glass-border);
  }

  /* About */
  .about-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--glass-border);
    background: var(--tint-subtle);
  }
  .about-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
    color: var(--color-brand-400);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .about-icon svg {
    width: 20px;
    height: 20px;
  }
  .about-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .about-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-surface-200);
  }
  .about-version {
    font-size: 11px;
    color: var(--color-surface-500);
  }
  .about-actions {
    margin-left: auto;
    flex-shrink: 0;
  }
  .check-update-btn {
    padding: 4px 12px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--tint-muted);
    color: var(--color-surface-200);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .check-update-btn:hover {
    border-color: var(--border-default);
    background: var(--tint-active);
  }
  .update-status {
    font-size: 11px;
    color: var(--color-surface-400);
  }
  .update-found {
    color: var(--color-brand-400);
    font-weight: 500;
  }
  .update-ok {
    color: var(--color-success-muted);
  }
  .update-err {
    color: var(--color-danger-light);
  }
</style>
