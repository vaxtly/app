<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import type { McpLastResponse } from '../../lib/stores/app.svelte'

  interface Props {
    serverId: string
    ongetresult?: (response: McpLastResponse) => void
  }

  let { serverId, ongetresult }: Props = $props()

  let connectionState = $derived(mcpStore.connectionStates[serverId])
  let prompts = $derived(connectionState?.prompts ?? [])

  let expandedPrompt = $state<string | null>(null)
  let promptArgs = $state<Record<string, Record<string, string>>>({})
  let promptErrors = $state<Record<string, string | null>>({})
  let promptLoading = $state<Record<string, boolean>>({})

  function togglePrompt(name: string): void {
    expandedPrompt = expandedPrompt === name ? null : name
  }

  function getArgs(name: string): Record<string, string> {
    return promptArgs[name] ?? {}
  }

  function setArg(name: string, key: string, value: string): void {
    promptArgs[name] = { ...getArgs(name), [key]: value }
  }

  async function getPrompt(name: string): Promise<void> {
    promptLoading[name] = true
    promptErrors[name] = null
    ongetresult?.({ type: 'prompt', name, loading: true, timestamp: Date.now() })

    try {
      const args = getArgs(name)
      const hasArgs = Object.keys(args).length > 0
      const result = await mcpStore.getPrompt(serverId, name, hasArgs ? args : undefined)
      ongetresult?.({ type: 'prompt', name, result, loading: false, timestamp: Date.now() })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      promptErrors[name] = error
      ongetresult?.({ type: 'prompt', name, error, loading: false, timestamp: Date.now() })
    } finally {
      promptLoading[name] = false
    }
  }
</script>

<div class="flex h-full flex-col overflow-y-auto">
  {#if !connectionState || connectionState.status !== 'connected'}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-surface-500">Connect to the server to view prompts</p>
    </div>
  {:else if prompts.length === 0}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-surface-500">No prompts available</p>
    </div>
  {:else}
    <div class="flex flex-col">
      {#each prompts as prompt (prompt.name)}
        <div class="border-b border-[var(--glass-border)]">
          <button
            onclick={() => togglePrompt(prompt.name)}
            class="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--tint-subtle)]"
          >
            <svg
              class="h-3 w-3 shrink-0 text-surface-500 transition-transform {expandedPrompt === prompt.name ? 'rotate-90' : ''}"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
            <span class="font-mono text-xs font-medium text-surface-200">{prompt.name}</span>
            {#if prompt.description}
              <span class="min-w-0 flex-1 truncate text-xs text-surface-500">{prompt.description}</span>
            {/if}
          </button>

          {#if expandedPrompt === prompt.name}
            <div class="flex flex-col gap-3 px-4 pb-4 pt-1">
              {#if prompt.description}
                <p class="text-xs text-surface-400">{prompt.description}</p>
              {/if}

              <!-- Prompt arguments -->
              {#if prompt.arguments && prompt.arguments.length > 0}
                <div class="flex flex-col gap-2">
                  <span class="text-[10px] uppercase tracking-wider text-surface-500">Arguments</span>
                  {#each prompt.arguments as arg (arg.name)}
                    <label class="flex flex-col gap-1">
                      <span class="text-xs text-surface-400">
                        {arg.name}
                        {#if arg.required}<span class="text-red-400">*</span>{/if}
                        {#if arg.description}
                          <span class="ml-1 text-surface-600">{arg.description}</span>
                        {/if}
                      </span>
                      <input
                        type="text"
                        value={getArgs(prompt.name)[arg.name] ?? ''}
                        oninput={(e) => setArg(prompt.name, arg.name, (e.target as HTMLInputElement).value)}
                        class="h-7 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-2 font-mono text-xs text-surface-200 focus:border-brand-500/50 focus:outline-none"
                      />
                    </label>
                  {/each}
                </div>
              {/if}

              <button
                onclick={() => getPrompt(prompt.name)}
                disabled={promptLoading[prompt.name]}
                class="self-start rounded-md border border-brand-500/30 bg-brand-500/15 px-3 py-1.5 text-xs text-brand-300 transition-colors hover:bg-brand-500/25 disabled:opacity-50"
              >
                {promptLoading[prompt.name] ? 'Loading...' : 'Get Prompt'}
              </button>

              {#if promptErrors[prompt.name]}
                <div class="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {promptErrors[prompt.name]}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
