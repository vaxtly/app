<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import McpJsonSchemaForm from './McpJsonSchemaForm.svelte'
  import type { McpToolCallResult } from '../../lib/types'

  interface Props {
    serverId: string
  }

  let { serverId }: Props = $props()

  let connectionState = $derived(mcpStore.connectionStates[serverId])
  let tools = $derived(connectionState?.tools ?? [])

  let expandedTool = $state<string | null>(null)
  let toolArgs = $state<Record<string, Record<string, unknown>>>({})
  let toolResults = $state<Record<string, McpToolCallResult | null>>({})
  let toolErrors = $state<Record<string, string | null>>({})
  let toolLoading = $state<Record<string, boolean>>({})

  function toggleTool(name: string): void {
    expandedTool = expandedTool === name ? null : name
  }

  function getArgs(name: string): Record<string, unknown> {
    return toolArgs[name] ?? {}
  }

  function setArgs(name: string, value: Record<string, unknown>): void {
    toolArgs[name] = value
  }

  async function callTool(name: string): Promise<void> {
    toolLoading[name] = true
    toolErrors[name] = null
    toolResults[name] = null

    try {
      const result = await mcpStore.callTool(serverId, name, getArgs(name))
      toolResults[name] = result
    } catch (err) {
      toolErrors[name] = err instanceof Error ? err.message : String(err)
    } finally {
      toolLoading[name] = false
    }
  }
</script>

<div class="flex h-full flex-col overflow-y-auto">
  {#if !connectionState || connectionState.status !== 'connected'}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-surface-500">Connect to the server to view tools</p>
    </div>
  {:else if tools.length === 0}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-surface-500">No tools available</p>
    </div>
  {:else}
    <div class="flex flex-col">
      {#each tools as tool (tool.name)}
        <div class="border-b border-[var(--glass-border)]">
          <!-- Tool header -->
          <button
            onclick={() => toggleTool(tool.name)}
            class="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--tint-subtle)]"
          >
            <svg
              class="h-3 w-3 shrink-0 text-surface-500 transition-transform {expandedTool === tool.name ? 'rotate-90' : ''}"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
            <span class="font-mono text-xs font-medium text-brand-300">{tool.name}</span>
            {#if tool.description}
              <span class="min-w-0 flex-1 truncate text-xs text-surface-500">{tool.description}</span>
            {/if}
          </button>

          <!-- Tool expanded content -->
          {#if expandedTool === tool.name}
            <div class="flex flex-col gap-3 px-4 pb-4 pt-1">
              {#if tool.description}
                <p class="text-xs text-surface-400">{tool.description}</p>
              {/if}

              <!-- Arguments form -->
              <McpJsonSchemaForm
                schema={tool.inputSchema}
                value={getArgs(tool.name)}
                onchange={(v) => setArgs(tool.name, v)}
              />

              <!-- Call button -->
              <button
                onclick={() => callTool(tool.name)}
                disabled={toolLoading[tool.name]}
                class="self-start rounded-md border border-brand-500/30 bg-brand-500/15 px-3 py-1.5 text-xs text-brand-300 transition-colors hover:bg-brand-500/25 disabled:opacity-50"
              >
                {toolLoading[tool.name] ? 'Calling...' : 'Call Tool'}
              </button>

              <!-- Error -->
              {#if toolErrors[tool.name]}
                <div class="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {toolErrors[tool.name]}
                </div>
              {/if}

              <!-- Result -->
              {#if toolResults[tool.name]}
                <div class="flex flex-col gap-1">
                  <span class="text-[10px] uppercase tracking-wider text-surface-500">
                    Result {toolResults[tool.name]?.isError ? '(error)' : ''}
                  </span>
                  <div class="rounded-md bg-[var(--tint-subtle)] p-3">
                    {#each toolResults[tool.name]?.content ?? [] as block}
                      {#if block.type === 'text'}
                        <pre class="whitespace-pre-wrap font-mono text-xs text-surface-300">{block.text}</pre>
                      {:else if block.type === 'image'}
                        <img
                          src="data:{block.mimeType ?? 'image/png'};base64,{block.data}"
                          alt="Tool result"
                          class="max-h-64 rounded"
                        />
                      {:else if block.type === 'resource'}
                        <div class="text-xs text-surface-400">
                          <span class="font-medium">{block.resource?.uri}</span>
                          {#if block.resource?.text}
                            <pre class="mt-1 whitespace-pre-wrap font-mono text-surface-300">{block.resource.text}</pre>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
