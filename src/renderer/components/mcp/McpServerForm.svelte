<script lang="ts">
  import { mcpStore } from '../../lib/stores/mcp.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import KeyValueEditor from '../shared/KeyValueEditor.svelte'
  import type { McpTransportType, KeyValueEntry } from '../../lib/types'

  interface Props {
    serverId: string
    onclose: () => void
  }

  let { serverId, onclose }: Props = $props()

  let server = $derived(mcpStore.servers.find((s) => s.id === serverId))

  let name = $state('')
  let transportType = $state<McpTransportType>('stdio')
  let command = $state('')
  let args = $state('')
  let envEntries = $state<KeyValueEntry[]>([])
  let cwd = $state('')
  let url = $state('')
  let headerEntries = $state<KeyValueEntry[]>([])

  /** Convert a JSON object string (e.g. '{"key":"value"}') to KeyValueEntry[] */
  function jsonToEntries(json: string | null): KeyValueEntry[] {
    if (!json) return []
    try {
      const obj = JSON.parse(json) as Record<string, string>
      return Object.entries(obj).map(([key, value]) => ({ key, value, enabled: true }))
    } catch {
      return []
    }
  }

  /** Convert KeyValueEntry[] back to a JSON object string, or null if empty */
  function entriesToJson(entries: KeyValueEntry[]): string | null {
    const enabled = entries.filter((e) => e.enabled && e.key.trim())
    if (enabled.length === 0) return null
    const obj: Record<string, string> = {}
    for (const e of enabled) {
      obj[e.key] = e.value
    }
    return JSON.stringify(obj)
  }

  // Initialize form from server data
  $effect(() => {
    if (server) {
      name = server.name
      transportType = server.transport_type
      command = server.command ?? ''
      args = server.args ? JSON.parse(server.args).join(' ') : ''
      envEntries = jsonToEntries(server.env)
      cwd = server.cwd ?? ''
      url = server.url ?? ''
      headerEntries = jsonToEntries(server.headers)
    }
  })

  async function handleSave(): Promise<void> {
    const data: Record<string, unknown> = {
      name,
      transport_type: transportType,
    }

    if (transportType === 'stdio') {
      data.command = command || null
      data.args = args.trim() ? JSON.stringify(args.trim().split(/\s+/)) : null
      data.env = entriesToJson(envEntries)
      data.cwd = cwd.trim() || null
      data.url = null
      data.headers = null
    } else {
      data.url = url || null
      data.headers = entriesToJson(headerEntries)
      data.command = null
      data.args = null
      data.env = null
      data.cwd = null
    }

    const updated = await mcpStore.updateServer(serverId, data)
    if (updated) {
      // Update the tab label if name changed
      const tabId = `tab-mcp-${serverId}`
      appStore.updateTabLabel(tabId, updated.name)
    }
    onclose()
  }

  async function handleDelete(): Promise<void> {
    await mcpStore.deleteServer(serverId)
    const tabId = `tab-mcp-${serverId}`
    appStore.closeTab(tabId)
  }

  const TRANSPORT_OPTIONS: { value: McpTransportType; label: string; description: string }[] = [
    { value: 'stdio', label: 'stdio', description: 'Local process (command + args)' },
    { value: 'streamable-http', label: 'Streamable HTTP', description: 'HTTP endpoint with streaming' },
    { value: 'sse', label: 'SSE (Legacy)', description: 'Server-Sent Events endpoint' },
  ]
</script>

<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="flex shrink-0 items-center gap-3 px-4 py-3" style="border-bottom: 1px solid var(--glass-border)">
    <button
      onclick={onclose}
      aria-label="Back"
      class="flex h-6 w-6 items-center justify-center rounded-md text-surface-400 hover:bg-[var(--tint-muted)] hover:text-surface-200"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <h2 class="text-sm font-medium text-surface-200">Server Configuration</h2>
    <div class="flex-1"></div>
    <button
      onclick={handleDelete}
      class="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-red-400 transition-colors hover:bg-red-500/10"
    >
      Delete
    </button>
    <button
      onclick={handleSave}
      class="flex h-7 items-center rounded-md border border-brand-500/30 bg-brand-500/15 px-3 text-xs text-brand-300 transition-colors hover:bg-brand-500/25"
    >
      Save
    </button>
  </div>

  <!-- Form -->
  <div class="flex-1 overflow-y-auto p-4">
    <div class="mx-auto flex max-w-lg flex-col gap-4">
      <!-- Name -->
      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-surface-400">Name</span>
        <input
          type="text"
          bind:value={name}
          class="h-8 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-3 text-sm text-surface-200 focus:border-brand-500/50 focus:outline-none"
          placeholder="My MCP Server"
        />
      </label>

      <!-- Transport type -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-surface-400">Transport</span>
        <div class="flex flex-col gap-1">
          {#each TRANSPORT_OPTIONS as opt (opt.value)}
            <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--tint-subtle)]">
              <input
                type="radio"
                name="transport"
                value={opt.value}
                checked={transportType === opt.value}
                onchange={() => { transportType = opt.value }}
                class="accent-brand-500"
              />
              <div>
                <span class="text-xs font-medium text-surface-300">{opt.label}</span>
                <span class="ml-1 text-[10px] text-surface-500">{opt.description}</span>
              </div>
            </label>
          {/each}
        </div>
      </div>

      {#if transportType === 'stdio'}
        <!-- Command -->
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-surface-400">Command</span>
          <input
            type="text"
            bind:value={command}
            class="h-8 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-3 font-mono text-sm text-surface-200 focus:border-brand-500/50 focus:outline-none"
            placeholder="npx"
          />
        </label>

        <!-- Args -->
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-surface-400">Arguments <span class="text-surface-600">(space-separated)</span></span>
          <input
            type="text"
            bind:value={args}
            class="h-8 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-3 font-mono text-sm text-surface-200 focus:border-brand-500/50 focus:outline-none"
            placeholder="-y @modelcontextprotocol/server-everything"
          />
        </label>

        <!-- Environment variables -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-surface-400">Environment Variables</span>
          <KeyValueEditor
            entries={envEntries}
            onchange={(v) => { envEntries = v }}
            keyPlaceholder="Variable"
            valuePlaceholder="Value"
          />
        </div>

        <!-- Working directory -->
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-surface-400">Working Directory <span class="text-surface-600">(optional)</span></span>
          <input
            type="text"
            bind:value={cwd}
            class="h-8 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-3 font-mono text-sm text-surface-200 focus:border-brand-500/50 focus:outline-none"
            placeholder="/path/to/project"
          />
        </label>
      {:else}
        <!-- URL -->
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-surface-400">URL</span>
          <input
            type="text"
            bind:value={url}
            class="h-8 rounded-md border border-[var(--tint-muted)] bg-[var(--tint-subtle)] px-3 font-mono text-sm text-surface-200 focus:border-brand-500/50 focus:outline-none"
            placeholder="http://localhost:3000/mcp"
          />
        </label>

        <!-- Headers -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-surface-400">Headers</span>
          <KeyValueEditor
            entries={headerEntries}
            onchange={(v) => { headerEntries = v }}
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
          />
        </div>
      {/if}
    </div>
  </div>
</div>
