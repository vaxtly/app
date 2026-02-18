<script lang="ts">
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import type { ScriptsConfig } from '../../lib/types'

  interface Props {
    scripts: ScriptsConfig
    collectionId?: string
    requestId: string
    onchange: (scripts: ScriptsConfig) => void
  }

  let { scripts, collectionId, requestId, onchange }: Props = $props()

  // Available requests in the same collection (exclude self)
  let availableRequests = $derived(
    collectionsStore.requests
      .filter((r) => r.collection_id === collectionId && r.id !== requestId)
      .map((r) => ({ id: r.id, name: r.name, method: r.method })),
  )

  let hasPreRequest = $derived(!!scripts.pre_request)
  let hasPostResponse = $derived(!!scripts.post_response && scripts.post_response.length > 0)

  function togglePreRequest(): void {
    if (hasPreRequest) {
      onchange({ ...scripts, pre_request: undefined })
    } else {
      onchange({ ...scripts, pre_request: { action: 'send_request', request_id: '' } })
    }
  }

  function updatePreRequestId(requestId: string): void {
    onchange({ ...scripts, pre_request: { action: 'send_request', request_id: requestId } })
  }

  function addPostResponse(): void {
    const existing = scripts.post_response ?? []
    onchange({ ...scripts, post_response: [...existing, { action: 'set_variable', source: '', target: '' }] })
  }

  function updatePostResponse(index: number, field: 'source' | 'target', value: string): void {
    const updated = [...(scripts.post_response ?? [])]
    updated[index] = { ...updated[index], [field]: value }
    onchange({ ...scripts, post_response: updated })
  }

  function removePostResponse(index: number): void {
    const updated = (scripts.post_response ?? []).filter((_, i) => i !== index)
    onchange({ ...scripts, post_response: updated.length > 0 ? updated : undefined })
  }
</script>

<div class="space-y-5 p-3">
  <!-- Pre-request script -->
  <section>
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-xs font-medium text-surface-300">Pre-request Script</h3>
      <button
        onclick={togglePreRequest}
        class="text-xs {hasPreRequest ? 'text-red-400 hover:text-red-300' : 'text-brand-400 hover:text-brand-300'}"
      >
        {hasPreRequest ? 'Remove' : '+ Add'}
      </button>
    </div>

    {#if hasPreRequest}
      <div class="rounded border border-surface-700 bg-surface-800/50 p-3">
        <span class="mb-1 block text-[11px] text-surface-400">Send dependent request first</span>
        <select
          value={scripts.pre_request?.request_id ?? ''}
          onchange={(e) => updatePreRequestId(e.currentTarget.value)}
          class="w-full rounded border border-surface-600 bg-surface-800 px-2 py-1.5 text-xs text-surface-200 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Select a request...</option>
          {#each availableRequests as req}
            <option value={req.id}>
              {req.method} — {req.name}
            </option>
          {/each}
        </select>
        {#if availableRequests.length === 0}
          <p class="mt-1 text-[11px] text-surface-500">No other requests in this collection.</p>
        {/if}
      </div>
    {:else}
      <p class="text-[11px] text-surface-500">
        Fire a dependent request before this one runs. Useful for fetching auth tokens.
      </p>
    {/if}
  </section>

  <!-- Post-response scripts -->
  <section>
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-xs font-medium text-surface-300">Post-response Scripts</h3>
      <button
        onclick={addPostResponse}
        class="text-xs text-brand-400 hover:text-brand-300"
      >
        + Add
      </button>
    </div>

    {#if hasPostResponse}
      <div class="space-y-2">
        {#each scripts.post_response ?? [] as script, i}
          <div class="flex items-start gap-2 rounded border border-surface-700 bg-surface-800/50 p-2">
            <div class="flex-1 space-y-1.5">
              <div>
                <span class="mb-0.5 block text-[10px] text-surface-500">Source (e.g. body.data.token, header.X-Auth, status)</span>
                <input
                  type="text"
                  value={script.source}
                  oninput={(e) => updatePostResponse(i, 'source', e.currentTarget.value)}
                  placeholder="body.data.access_token"
                  class="w-full rounded border border-surface-600 bg-surface-800 px-2 py-1 text-xs text-surface-200 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <span class="mb-0.5 block text-[10px] text-surface-500">Target variable name</span>
                <input
                  type="text"
                  value={script.target}
                  oninput={(e) => updatePostResponse(i, 'target', e.currentTarget.value)}
                  placeholder="auth_token"
                  class="w-full rounded border border-surface-600 bg-surface-800 px-2 py-1 text-xs text-surface-200 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              onclick={() => removePostResponse(i)}
              class="mt-2 text-surface-500 hover:text-red-400"
              title="Remove"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-[11px] text-surface-500">
        Extract values from the response and set them as collection variables.
      </p>
    {/if}
  </section>
</div>
