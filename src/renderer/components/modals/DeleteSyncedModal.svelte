<script lang="ts">
  import Modal from '../shared/Modal.svelte'

  interface Props {
    collectionName: string
    ondelete: (resolution: 'local-only' | 'everywhere') => void
    onclose: () => void
  }

  let { collectionName, ondelete, onclose }: Props = $props()

  let resolving = $state<'local-only' | 'everywhere' | null>(null)

  function handleDelete(resolution: 'local-only' | 'everywhere'): void {
    resolving = resolution
    ondelete(resolution)
  }
</script>

<Modal title="Delete Synced Collection" {onclose} width="max-w-lg">
  <!-- Warning banner -->
  <div class="warning-banner mb-4 rounded px-3 py-2 text-xs">
    <div class="flex items-center gap-2">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span><strong>{collectionName}</strong> is synced to a remote repository.</span>
    </div>
  </div>

  <!-- Resolution cards -->
  <div class="grid grid-cols-2 gap-3">
    <!-- Delete locally only -->
    <button
      onclick={() => handleDelete('local-only')}
      disabled={resolving !== null}
      class="group rounded-lg border border-surface-700 p-3 text-left transition-colors hover:border-brand-500 hover:bg-surface-800 disabled:opacity-50"
    >
      <div class="mb-2 flex items-center gap-2">
        <svg class="h-5 w-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.07 7.409A2.25 2.25 0 012 5.493V5.25" />
        </svg>
        <span class="text-sm font-medium text-surface-200">Delete locally only</span>
      </div>
      <p class="text-xs text-surface-500">
        Remove from this app. The remote copy will remain in the repository.
      </p>
      {#if resolving === 'local-only'}
        <div class="mt-2 text-xs text-brand-400">Deleting...</div>
      {/if}
    </button>

    <!-- Delete everywhere -->
    <button
      onclick={() => handleDelete('everywhere')}
      disabled={resolving !== null}
      class="group rounded-lg border border-surface-700 p-3 text-left transition-colors hover:border-red-500 hover:bg-surface-800 disabled:opacity-50"
    >
      <div class="mb-2 flex items-center gap-2">
        <svg class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        <span class="text-sm font-medium text-red-400">Delete everywhere</span>
      </div>
      <p class="text-xs text-surface-500">
        Remove from this app AND delete from the remote repository.
      </p>
      {#if resolving === 'everywhere'}
        <div class="mt-2 text-xs text-red-400">Deleting...</div>
      {/if}
    </button>
  </div>
</Modal>

<style>
  .warning-banner {
    color: var(--color-warning);
    background: color-mix(in srgb, var(--color-warning) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
  }
  .warning-banner strong {
    color: var(--color-warning-light);
  }
</style>
