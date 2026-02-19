<script lang="ts">
  import { settingsStore } from '../../lib/stores/settings.svelte'
  import Toggle from '../shared/Toggle.svelte'

  // Local state mirrors store for immediate UI feedback
  let layout = $derived(settingsStore.get('request.layout'))
  let timeout = $derived(settingsStore.get('request.timeout'))
  let verifySsl = $derived(settingsStore.get('request.verify_ssl'))
  let followRedirects = $derived(settingsStore.get('request.follow_redirects'))
  let retentionDays = $derived(settingsStore.get('history.retention_days'))
  let appVersion = $derived(settingsStore.get('app.version'))

  function handleLayoutChange(e: Event): void {
    const value = (e.target as HTMLSelectElement).value as 'rows' | 'columns'
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

<div class="space-y-0">
  <!-- Request Layout -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">Request Layout</div>
      <div class="text-xs text-surface-500">How request and response panels are arranged</div>
    </div>
    <select
      value={layout}
      onchange={handleLayoutChange}
      class="h-7 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 focus:border-brand-500 focus:outline-none"
    >
      <option value="rows">Top / Bottom</option>
      <option value="columns">Side by Side</option>
    </select>
  </div>

  <!-- Request Timeout -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">Request Timeout</div>
      <div class="text-xs text-surface-500">Maximum time to wait for a response (seconds)</div>
    </div>
    <div class="flex items-center gap-1.5">
      <input
        type="number"
        value={timeout}
        onchange={handleTimeoutChange}
        min="1"
        max="300"
        class="h-7 w-16 rounded border border-surface-700 bg-surface-800/50 px-2 text-right text-xs text-surface-100 focus:border-brand-500 focus:outline-none"
      />
      <span class="text-xs text-surface-500">sec</span>
    </div>
  </div>

  <!-- Verify SSL -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">Verify SSL Certificates</div>
      <div class="text-xs text-surface-500">Reject requests with invalid or self-signed certificates</div>
    </div>
    <Toggle checked={verifySsl} onchange={toggleSsl} />
  </div>

  <!-- Follow Redirects -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">Follow Redirects</div>
      <div class="text-xs text-surface-500">Automatically follow HTTP redirects (3xx responses)</div>
    </div>
    <Toggle checked={followRedirects} onchange={toggleRedirects} />
  </div>

  <!-- History Retention -->
  <div class="flex items-center justify-between border-b border-surface-700 py-3">
    <div>
      <div class="text-sm text-surface-200">History Retention</div>
      <div class="text-xs text-surface-500">How long to keep request history entries</div>
    </div>
    <select
      value={retentionDays}
      onchange={handleRetentionChange}
      class="h-7 rounded border border-surface-700 bg-surface-800/50 px-2 text-xs text-surface-100 focus:border-brand-500 focus:outline-none"
    >
      <option value={1}>1 day</option>
      <option value={7}>7 days</option>
      <option value={30}>30 days</option>
      <option value={90}>90 days</option>
    </select>
  </div>

  <!-- About -->
  <div class="pt-4">
    <div class="text-xs font-medium uppercase tracking-wider text-surface-500">About</div>
    <div class="mt-2 rounded border border-surface-700 bg-surface-800/30 p-3">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
          <svg class="h-6 w-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <div class="text-sm font-medium text-surface-200">Vaxtly</div>
          <div class="text-xs text-surface-500">Version {appVersion}</div>
        </div>
      </div>
    </div>
  </div>
</div>
