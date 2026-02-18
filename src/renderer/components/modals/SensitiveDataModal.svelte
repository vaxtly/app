<script lang="ts">
  import Modal from '../shared/Modal.svelte'

  interface SensitiveFinding {
    source: string
    requestName: string | null
    requestId: string | null
    field: string
    key: string
    maskedValue: string
  }

  interface Props {
    findings: SensitiveFinding[]
    onclose: () => void
    onsyncanyway: () => void
    onsyncwithout: () => void
  }

  let { findings, onclose, onsyncanyway, onsyncwithout }: Props = $props()

  const sourceColors: Record<string, string> = {
    header: 'bg-blue-900/50 text-blue-300',
    query: 'bg-purple-900/50 text-purple-300',
    body: 'bg-amber-900/50 text-amber-300',
    auth: 'bg-red-900/50 text-red-300',
    url: 'bg-green-900/50 text-green-300',
  }

  function getSourceColor(source: string): string {
    return sourceColors[source] ?? 'bg-surface-700 text-surface-300'
  }

  // Group findings by request
  let grouped = $derived.by(() => {
    const map = new Map<string, { name: string; items: SensitiveFinding[] }>()
    for (const f of findings) {
      const key = f.requestId ?? '__collection__'
      const name = f.requestName ?? 'Collection Level'
      if (!map.has(key)) map.set(key, { name, items: [] })
      map.get(key)!.items.push(f)
    }
    return [...map.values()]
  })
</script>

<Modal title="Sensitive Data Detected" {onclose} width="max-w-lg">
  <!-- Warning -->
  <div class="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-xs text-amber-300">
    <div class="flex items-start gap-2">
      <svg class="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>
        Found <strong class="text-amber-200">{findings.length}</strong> potentially sensitive
        {findings.length === 1 ? 'value' : 'values'} that would be pushed to the remote repository.
      </span>
    </div>
  </div>

  <!-- Findings list -->
  <div class="max-h-60 overflow-y-auto">
    {#each grouped as group}
      <div class="mb-3">
        <div class="mb-1 text-xs font-medium text-surface-400">{group.name}</div>
        <div class="space-y-1">
          {#each group.items as finding}
            <div class="flex items-center gap-2 rounded bg-surface-800/50 px-2 py-1.5">
              <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {getSourceColor(finding.source)}">
                {finding.source}
              </span>
              <span class="text-xs text-surface-200">{finding.key}</span>
              <span class="flex-1 truncate text-right text-xs text-surface-500">{finding.maskedValue}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Actions -->
  <div class="mt-4 flex items-center justify-end gap-2 border-t border-surface-700 pt-4">
    <button
      onclick={onclose}
      class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800"
    >
      Cancel
    </button>
    <button
      onclick={onsyncwithout}
      class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800"
    >
      Sync without values
    </button>
    <button
      onclick={onsyncanyway}
      class="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
    >
      Sync Anyway
    </button>
  </div>
</Modal>
