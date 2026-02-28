<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import type { McpPromptGetResult } from '../../lib/types'

  interface Props {
    serverId: string
  }

  let { serverId }: Props = $props()

  let connectionState = $derived(mcpStore.connectionStates[serverId])
  let prompts = $derived(connectionState?.prompts ?? [])

  let expandedPrompt = $state<string | null>(null)
  let promptArgs = $state<Record<string, Record<string, string>>>({})
  let promptResults = $state<Record<string, McpPromptGetResult | null>>({})
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

    try {
      const args = getArgs(name)
      const hasArgs = Object.keys(args).length > 0
      const result = await mcpStore.getPrompt(serverId, name, hasArgs ? args : undefined)
      promptResults[name] = result
    } catch (err) {
      promptErrors[name] = err instanceof Error ? err.message : String(err)
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

              {#if promptResults[prompt.name]}
                <div class="flex flex-col gap-2">
                  {#if promptResults[prompt.name]?.description}
                    <p class="text-xs text-surface-400">{promptResults[prompt.name]?.description}</p>
                  {/if}
                  <span class="text-[10px] uppercase tracking-wider text-surface-500">Messages</span>
                  {#each promptResults[prompt.name]?.messages ?? [] as message, i}
                    <div class="rounded-md bg-[var(--tint-subtle)] p-3">
                      <div class="mb-1 text-[10px] font-medium uppercase text-surface-500">{message.role}</div>
                      {#if message.content.type === 'text'}
                        <pre class="whitespace-pre-wrap font-mono text-xs text-surface-300">{message.content.text}</pre>
                      {:else if message.content.type === 'image'}
                        <img
                          src="data:{message.content.mimeType ?? 'image/png'};base64,{message.content.data}"
                          alt="Prompt message {i}"
                          class="max-h-48 rounded"
                        />
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
