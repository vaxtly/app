<script lang="ts">
  import Modal from '../shared/Modal.svelte'

  interface Props {
    name: string
    onresolve: (resolution: 'delete' | 'keep') => void
    onclose: () => void
  }

  let { name, onresolve, onclose }: Props = $props()

  let resolving = $state<'delete' | 'keep' | null>(null)

  function handleResolve(resolution: 'delete' | 'keep'): void {
    resolving = resolution
    onresolve(resolution)
  }
</script>

<Modal title="Orphaned Collection" {onclose} width="max-w-lg">
  <!-- Info banner -->
  <div class="info-banner mb-4 rounded px-3 py-2 text-xs">
    <div class="flex items-center gap-2">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
      <span><strong>{name}</strong> was synced but the remote copy no longer exists.</span>
    </div>
  </div>

  <!-- Resolution cards -->
  <div class="grid grid-cols-2 gap-3">
    <!-- Delete locally -->
    <button
      onclick={() => handleResolve('delete')}
      disabled={resolving !== null}
      class="group rounded-lg border border-surface-700 p-3 text-left transition-colors hover:border-red-500 hover:bg-surface-800 disabled:opacity-50"
    >
      <div class="mb-2 flex items-center gap-2">
        <svg class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        <span class="text-sm font-medium text-surface-200">Delete locally</span>
      </div>
      <p class="text-xs text-surface-500">
        Remove this collection from your local app.
      </p>
      {#if resolving === 'delete'}
        <div class="mt-2 text-xs text-brand-400">Resolving...</div>
      {/if}
    </button>

    <!-- Keep locally -->
    <button
      onclick={() => handleResolve('keep')}
      disabled={resolving !== null}
      class="group rounded-lg border border-surface-700 p-3 text-left transition-colors hover:border-brand-500 hover:bg-surface-800 disabled:opacity-50"
    >
      <div class="mb-2 flex items-center gap-2">
        <svg class="h-5 w-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
        <span class="text-sm font-medium text-surface-200">Keep locally</span>
      </div>
      <p class="text-xs text-surface-500">
        Keep the collection but disable sync.
      </p>
      {#if resolving === 'keep'}
        <div class="mt-2 text-xs text-brand-400">Resolving...</div>
      {/if}
    </button>
  </div>
</Modal>

<style>
  .info-banner {
    color: var(--color-brand-300);
    background: color-mix(in srgb, var(--color-brand-500) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-brand-500) 25%, transparent);
  }
  .info-banner strong {
    color: var(--color-brand-200);
  }
</style>
