<script lang="ts">
  import { settingsStore } from '../../lib/stores/settings.svelte'

  const ISSUES_URL = 'https://github.com/vaxtly/app/issues'

  function getOS(): string {
    const ua = navigator.userAgent
    if (ua.includes('Macintosh')) return 'macOS'
    if (ua.includes('Windows')) return 'Windows'
    return 'Linux'
  }

  function openIssues(): void {
    window.open(ISSUES_URL, '_blank')
  }

  function openBugReport(): void {
    const version = settingsStore.get('app.version') ?? ''
    const params = new URLSearchParams({
      template: 'bug_report.yml',
      os: getOS(),
      version,
    })
    window.open(`${ISSUES_URL}/new?${params}`, '_blank')
  }

  function openFeatureRequest(): void {
    window.open(`${ISSUES_URL}/new?template=feature_request.yml`, '_blank')
  }
</script>

<div class="space-y-6">
  <!-- Intro -->
  <div>
    <h3 class="text-sm font-semibold text-surface-200">Report an Issue or Request a Feature</h3>
    <p class="mt-1 text-xs text-surface-400">
      We use GitHub Issues to track bugs, feature requests, and improvements.
      Your feedback helps make Vaxtly better for everyone.
    </p>
  </div>

  <!-- How to -->
  <div class="rounded-[10px] p-4" style="border: 1px solid var(--glass-border); background: var(--tint-subtle)">
    <h4 class="mb-3 text-xs font-semibold uppercase text-surface-400">How to submit a good issue</h4>
    <ol class="space-y-2 text-xs text-surface-300">
      <li class="flex gap-2">
        <span class="shrink-0 font-mono text-brand-400">1.</span>
        <span><strong class="text-surface-200">Search first</strong> — check if a similar issue already exists to avoid duplicates.</span>
      </li>
      <li class="flex gap-2">
        <span class="shrink-0 font-mono text-brand-400">2.</span>
        <span><strong class="text-surface-200">Choose a template</strong> — pick "Bug Report" or "Feature Request" when creating a new issue.</span>
      </li>
      <li class="flex gap-2">
        <span class="shrink-0 font-mono text-brand-400">3.</span>
        <span><strong class="text-surface-200">Be specific</strong> — include steps to reproduce, expected vs actual behavior, and your OS/version.</span>
      </li>
      <li class="flex gap-2">
        <span class="shrink-0 font-mono text-brand-400">4.</span>
        <span><strong class="text-surface-200">Add context</strong> — screenshots, error messages, or exported request data help us fix things faster.</span>
      </li>
    </ol>
  </div>

  <!-- Actions -->
  <div class="flex gap-3">
    <button
      onclick={openBugReport}
      class="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-500"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 9v2m0 4h.01M5.07 19H19a2.18 2.18 0 001.87-3.17L13.87 4.33a2.18 2.18 0 00-3.74 0L3.2 15.83A2.18 2.18 0 005.07 19z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Bug Report
    </button>
    <button
      onclick={openFeatureRequest}
      class="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-surface-300 transition-colors hover:bg-[var(--tint-active)]"
      style="border: 1px solid var(--glass-border)"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Feature Request
    </button>
    <button
      onclick={openIssues}
      class="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-surface-300 transition-colors hover:bg-[var(--tint-active)]"
      style="border: 1px solid var(--glass-border)"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      View All Issues
    </button>
  </div>
</div>
