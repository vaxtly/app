<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import type { McpLastResponse } from '../../lib/stores/app.svelte'

  interface Props {
    serverId: string
    onreadresult?: (response: McpLastResponse) => void
  }

  let { serverId, onreadresult }: Props = $props()

  let connectionState = $derived(mcpStore.connectionStates[serverId])
  let resources = $derived(connectionState?.resources ?? [])
  let resourceTemplates = $derived(connectionState?.resourceTemplates ?? [])

  let readErrors = $state<Record<string, string | null>>({})
  let readLoading = $state<Record<string, boolean>>({})
  let expandedUri = $state<string | null>(null)

  function toggleResource(uri: string): void {
    expandedUri = expandedUri === uri ? null : uri
  }

  async function readResource(uri: string, name: string): Promise<void> {
    readLoading[uri] = true
    readErrors[uri] = null
    onreadresult?.({ type: 'resource', name, loading: true, timestamp: Date.now() })

    try {
      const result = await mcpStore.readResource(serverId, uri)
      onreadresult?.({ type: 'resource', name, result, loading: false, timestamp: Date.now() })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      readErrors[uri] = error
      onreadresult?.({ type: 'resource', name, error, loading: false, timestamp: Date.now() })
    } finally {
      readLoading[uri] = false
    }
  }
</script>

<div class="flex h-full flex-col overflow-y-auto">
  {#if !connectionState || connectionState.status !== 'connected'}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-surface-500">Connect to the server to view resources</p>
    </div>
  {:else if resources.length === 0 && resourceTemplates.length === 0}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-surface-500">No resources available</p>
    </div>
  {:else}
    <div class="flex flex-col">
      <!-- Resources -->
      {#each resources as resource (resource.uri)}
        <div class="border-b border-[var(--glass-border)]">
          <button
            onclick={() => toggleResource(resource.uri)}
            class="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--tint-subtle)]"
          >
            <svg
              class="h-3 w-3 shrink-0 text-surface-500 transition-transform {expandedUri === resource.uri ? 'rotate-90' : ''}"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
            <span class="font-mono text-xs font-medium text-surface-200">{resource.name}</span>
            <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-surface-500">{resource.uri}</span>
            {#if resource.mimeType}
              <span class="shrink-0 text-[10px] text-surface-600">{resource.mimeType}</span>
            {/if}
          </button>

          {#if expandedUri === resource.uri}
            <div class="flex flex-col gap-2 px-4 pb-4 pt-1">
              {#if resource.description}
                <p class="text-xs text-surface-400">{resource.description}</p>
              {/if}

              <button
                onclick={() => readResource(resource.uri, resource.name)}
                disabled={readLoading[resource.uri]}
                class="self-start rounded-md border border-brand-500/30 bg-brand-500/15 px-3 py-1.5 text-xs text-brand-300 transition-colors hover:bg-brand-500/25 disabled:opacity-50"
              >
                {readLoading[resource.uri] ? 'Reading...' : 'Read Resource'}
              </button>

              {#if readErrors[resource.uri]}
                <div class="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {readErrors[resource.uri]}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      <!-- Resource Templates -->
      {#if resourceTemplates.length > 0}
        <div class="px-4 py-2">
          <span class="text-[10px] uppercase tracking-wider text-surface-500">Templates</span>
        </div>
        {#each resourceTemplates as template (template.uriTemplate)}
          <div class="border-b border-[var(--glass-border)] px-4 py-2.5">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-medium text-surface-200">{template.name}</span>
              <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-surface-500">{template.uriTemplate}</span>
            </div>
            {#if template.description}
              <p class="mt-0.5 text-xs text-surface-500">{template.description}</p>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
