<script lang="ts">
  import type { McpLastResponse } from '../../lib/stores/app.svelte'
  import type { McpToolCallResult, McpResourceReadResult, McpPromptGetResult } from '../../lib/types'

  interface Props {
    response: McpLastResponse | null
  }

  let { response }: Props = $props()

  let isToolResult = $derived(response?.type === 'tool' && response.result && !response.loading && !response.error)
  let isResourceResult = $derived(response?.type === 'resource' && response.result && !response.loading && !response.error)
  let isPromptResult = $derived(response?.type === 'prompt' && response.result && !response.loading && !response.error)
</script>

<div class="flex h-full flex-col overflow-y-auto">
  {#if !response}
    <!-- Empty state -->
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-surface-500">Execute a tool, resource, or prompt to see results</p>
    </div>
  {:else if response.loading}
    <!-- Loading state -->
    <div class="flex flex-1 items-center justify-center gap-2">
      <svg class="h-4 w-4 animate-spin text-surface-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
      <span class="text-sm text-surface-400">
        {response.type === 'tool' ? 'Calling tool' : response.type === 'resource' ? 'Reading resource' : 'Getting prompt'}:
        <code class="font-mono text-brand-300">{response.name}</code>...
      </span>
    </div>
  {:else if response.error}
    <!-- Error state -->
    <div class="p-4">
      <div class="flex items-center gap-2 pb-2">
        <span class="text-xs font-medium text-surface-300">
          {response.type === 'tool' ? 'Tool' : response.type === 'resource' ? 'Resource' : 'Prompt'}:
          <code class="font-mono text-brand-300">{response.name}</code>
        </span>
      </div>
      <div class="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
        {response.error}
      </div>
    </div>
  {:else if isToolResult}
    <!-- Tool result -->
    {@const result = response.result as McpToolCallResult}
    <div class="flex flex-col gap-2 p-4">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-surface-300">
          Tool: <code class="font-mono text-brand-300">{response.name}</code>
        </span>
        {#if result.isError}
          <span class="text-[10px] uppercase tracking-wider text-red-400">(error)</span>
        {/if}
      </div>
      <div class="rounded-md bg-[var(--tint-subtle)] p-3">
        {#each result.content ?? [] as block}
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
  {:else if isResourceResult}
    <!-- Resource result -->
    {@const result = response.result as McpResourceReadResult}
    <div class="flex flex-col gap-2 p-4">
      <span class="text-xs font-medium text-surface-300">
        Resource: <code class="font-mono text-brand-300">{response.name}</code>
      </span>
      {#each result.contents ?? [] as content}
        <div class="rounded-md bg-[var(--tint-subtle)] p-3">
          {#if content.text}
            <pre class="whitespace-pre-wrap font-mono text-xs text-surface-300">{content.text}</pre>
          {:else if content.blob}
            <p class="text-xs text-surface-400">Binary content ({content.mimeType ?? 'unknown type'})</p>
          {/if}
        </div>
      {/each}
    </div>
  {:else if isPromptResult}
    <!-- Prompt result -->
    {@const result = response.result as McpPromptGetResult}
    <div class="flex flex-col gap-2 p-4">
      <span class="text-xs font-medium text-surface-300">
        Prompt: <code class="font-mono text-brand-300">{response.name}</code>
      </span>
      {#if result.description}
        <p class="text-xs text-surface-400">{result.description}</p>
      {/if}
      <span class="text-[10px] uppercase tracking-wider text-surface-500">Messages</span>
      {#each result.messages ?? [] as message, i}
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
