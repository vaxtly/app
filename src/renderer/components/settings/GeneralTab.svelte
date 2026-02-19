<script lang="ts">
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import Toggle from '../shared/Toggle.svelte'

  let layout = $derived(settingsStore.get('request.layout'))
  let timeout = $derived(settingsStore.get('request.timeout'))
  let verifySsl = $derived(settingsStore.get('request.verify_ssl'))
  let followRedirects = $derived(settingsStore.get('request.follow_redirects'))
  let retentionDays = $derived(settingsStore.get('history.retention_days'))
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

  function handleLayoutChange(value: 'rows' | 'columns'): void {
    settingsStore.set('request.layout', value)
  }

  function handleTimeoutChange(e: Event): void {
    const value = Math.max(1, Math.min(300, Number((e.target as HTMLInputElement).value) || 30))
    settingsStore.set('request.timeout', value)
  }

  function handleRetentionChange(e: Event): void {
    const value = Number((e.target as HTMLSelectElement).value)
    settingsStore.set('history.retention_days', value)
  }

  function toggleSsl(value: boolean): void {
    settingsStore.set('request.verify_ssl', value)
  }

  function toggleRedirects(value: boolean): void {
    settingsStore.set('request.follow_redirects', value)
  }
</script>

<div class="general-tab">
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

  <!-- History section -->
  <section class="section">
    <div class="section-header">
      <div class="section-icon history-icon">
        <svg viewBox="0 0 18 18" fill="none">
          <path d="M9 5.5V9L11.5 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      </div>
      <div>
        <div class="section-title">History</div>
        <div class="section-subtitle">Request history retention</div>
      </div>
    </div>

    <div class="setting-row last">
      <div class="setting-info">
        <span class="setting-label">Keep history for</span>
        <span class="setting-desc">Older entries are automatically deleted</span>
      </div>
      <select
        value={retentionDays}
        onchange={handleRetentionChange}
        class="select-input"
      >
        <option value={1}>1 day</option>
        <option value={7}>7 days</option>
        <option value={30}>30 days</option>
        <option value={90}>90 days</option>
      </select>
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
  .http-icon {
    background: color-mix(in srgb, var(--color-brand-500) 15%, transparent);
    color: var(--color-brand-400);
  }
  .history-icon {
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
    border-radius: 6px;
    border: 1px solid var(--color-surface-700);
    background: transparent;
    color: var(--color-surface-500);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .layout-option:hover {
    border-color: var(--color-surface-600);
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
    border-radius: 6px;
    border: 1px solid var(--color-surface-700);
    background: var(--color-surface-800);
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
  .select-input {
    height: 28px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid var(--color-surface-700);
    background: var(--color-surface-800);
    color: var(--color-surface-100);
    font-size: 12px;
    outline: none;
    transition: border-color 0.12s;
    cursor: pointer;
  }
  .select-input:focus {
    border-color: var(--color-brand-500);
  }

  /* Divider */
  .divider {
    height: 1px;
    background: var(--color-surface-700);
  }

  /* About */
  .about-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--color-surface-700);
    background: color-mix(in srgb, var(--color-surface-800) 30%, transparent);
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
    border-radius: 6px;
    border: 1px solid var(--color-surface-600);
    background: var(--color-surface-700);
    color: var(--color-surface-200);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .check-update-btn:hover {
    border-color: var(--color-surface-500);
    background: var(--color-surface-600);
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
    color: #34d399;
  }
  .update-err {
    color: #f87171;
  }
</style>
