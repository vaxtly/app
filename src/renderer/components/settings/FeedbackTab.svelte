<script lang="ts">
  const ISSUES_URL = 'https://github.com/vaxtly/app/issues'

  function openIssues(): void {
    window.open(ISSUES_URL, '_blank')
  }

  function openNewIssue(): void {
    window.open(`${ISSUES_URL}/new/choose`, '_blank')
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
  <div class="rounded border border-surface-700 bg-surface-800/30 p-4">
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
      onclick={openNewIssue}
      class="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-500"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 4v16m8-8H4" stroke-linecap="round"/>
      </svg>
      New Issue
    </button>
    <button
      onclick={openIssues}
      class="flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-800 px-4 py-2 text-xs font-medium text-surface-300 transition-colors hover:bg-surface-700"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      View All Issues
    </button>
  </div>
</div>
