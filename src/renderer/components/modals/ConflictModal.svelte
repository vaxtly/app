<script lang="ts">
  import Modal from '../shared/Modal.svelte'

  interface Props {
    collection: { id: string; name: string }
    onresolve: (resolution: 'keep-local' | 'keep-remote') => void
    onclose: () => void
  }

  let { collection, onresolve, onclose }: Props = $props()

  let resolving = $state<'keep-local' | 'keep-remote' | null>(null)

  async function handleResolve(resolution: 'keep-local' | 'keep-remote'): Promise<void> {
    resolving = resolution
    onresolve(resolution)
  }
</script>

<Modal title="Sync Conflict" {onclose} width="max-w-lg">
  <!-- Warning banner -->
  <div class="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-xs text-amber-300">
    <div class="flex items-center gap-2">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>The collection <strong class="text-amber-200">{collection.name}</strong> has been modified both locally and remotely.</span>
    </div>
  </div>

  <!-- Resolution cards -->
  <div class="grid grid-cols-2 gap-3">
    <!-- Keep Local -->
    <button
      onclick={() => handleResolve('keep-local')}
      disabled={resolving !== null}
      class="group rounded-lg border border-surface-700 p-3 text-left transition-colors hover:border-brand-500 hover:bg-surface-800 disabled:opacity-50"
    >
      <div class="mb-2 flex items-center gap-2">
        <svg class="h-5 w-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.07 7.409A2.25 2.25 0 012 5.493V5.25" />
        </svg>
        <span class="text-sm font-medium text-surface-200">Keep Local</span>
      </div>
      <p class="text-xs text-surface-500">
        Overwrite the remote version with your local changes. The remote copy will be replaced.
      </p>
      {#if resolving === 'keep-local'}
        <div class="mt-2 text-xs text-brand-400">Resolving...</div>
      {/if}
    </button>

    <!-- Keep Remote -->
    <button
      onclick={() => handleResolve('keep-remote')}
      disabled={resolving !== null}
      class="group rounded-lg border border-surface-700 p-3 text-left transition-colors hover:border-brand-500 hover:bg-surface-800 disabled:opacity-50"
    >
      <div class="mb-2 flex items-center gap-2">
        <svg class="h-5 w-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
        </svg>
        <span class="text-sm font-medium text-surface-200">Keep Remote</span>
      </div>
      <p class="text-xs text-surface-500">
        Replace your local copy with the remote version. Your local changes will be lost.
      </p>
      {#if resolving === 'keep-remote'}
        <div class="mt-2 text-xs text-brand-400">Resolving...</div>
      {/if}
    </button>
  </div>
</Modal>
