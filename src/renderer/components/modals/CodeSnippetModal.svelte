<script lang="ts">
  import type { KeyValueEntry, AuthConfig } from '../../lib/types'

  interface Props {
    open: boolean
    method: string
    url: string
    headers: KeyValueEntry[]
    queryParams: KeyValueEntry[]
    body: string
    bodyType: string
    formData: { key: string; value: string; enabled: boolean }[]
    auth: AuthConfig
    workspaceId?: string
    collectionId?: string
    onclose: () => void
  }

  let { open, method, url, headers, queryParams, body, bodyType, formData, auth, workspaceId, collectionId, onclose }: Props = $props()

  type Language = 'curl' | 'python' | 'php' | 'javascript' | 'node'

  const languages: { key: Language; label: string }[] = [
    { key: 'curl', label: 'cURL' },
    { key: 'python', label: 'Python' },
    { key: 'php', label: 'PHP' },
    { key: 'javascript', label: 'JavaScript' },
    { key: 'node', label: 'Node.js' },
  ]

  let activeLanguage = $state<Language>('curl')
  let generatedCode = $state('')
  let copied = $state(false)

  $effect(() => {
    if (open) {
      generateSnippet(activeLanguage)
    }
  })

  async function generateSnippet(lang: Language): Promise<void> {
    activeLanguage = lang

    const authType = auth.type ?? 'none'
    const data = {
      method,
      url,
      headers,
      queryParams,
      body,
      bodyType,
      formData,
      authType,
      authToken: auth.bearer_token ?? '',
      authUsername: auth.basic_username ?? '',
      authPassword: auth.basic_password ?? '',
      apiKeyName: auth.api_key_header ?? '',
      apiKeyValue: auth.api_key_value ?? '',
    }

    try {
      generatedCode = await window.api.codeGenerator.generate(lang, data, workspaceId, collectionId)
    } catch (error) {
      generatedCode = `// Error generating code: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  async function copyToClipboard(): Promise<void> {
    await navigator.clipboard.writeText(generatedCode)
    copied = true
    setTimeout(() => { copied = false }, 2000)
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onclose()
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="csm-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    role="dialog"
    aria-modal="true"
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <button class="absolute inset-0" onclick={onclose} aria-label="Close"></button>

    <!-- Modal -->
    <div class="csm-modal relative z-10 flex max-h-[80vh] w-[680px] flex-col bg-surface-900">
      <!-- Header -->
      <div class="csm-header flex shrink-0 items-center justify-between px-4 py-3">
        <h2 class="text-sm font-semibold text-surface-200">Code Snippet</h2>
        <button onclick={onclose} class="text-surface-500 hover:text-surface-200" aria-label="Close">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Language tabs -->
      <div class="csm-tabs flex shrink-0 gap-1 px-4">
        {#each languages as lang}
          <button
            onclick={() => generateSnippet(lang.key)}
            class="px-3 py-2 text-xs transition-colors {activeLanguage === lang.key
              ? 'border-b-2 border-brand-500 text-brand-400'
              : 'text-surface-400 hover:text-surface-200'}"
          >
            {lang.label}
          </button>
        {/each}
      </div>

      <!-- Code -->
      <div class="flex-1 overflow-auto p-4">
        <pre class="whitespace-pre-wrap rounded bg-surface-800 p-3 font-mono text-xs text-surface-200">{generatedCode}</pre>
      </div>

      <!-- Footer -->
      <div class="csm-footer flex shrink-0 items-center justify-end gap-2 px-4 py-3">
        <button
          onclick={copyToClipboard}
          class="flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
        >
          {#if copied}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          {:else}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy to Clipboard
          {/if}
        </button>
        <button
          onclick={onclose}
          class="rounded border border-surface-600 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .csm-backdrop {
    animation: modal-backdrop-in 0.15s ease-out;
  }
  .csm-modal {
    border-radius: var(--radius-2xl);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-xl);
    animation: modal-content-in 0.2s ease-out;
  }
  .csm-header {
    border-bottom: 1px solid var(--border-subtle);
  }
  .csm-tabs {
    border-bottom: 1px solid var(--border-subtle);
  }
  .csm-footer {
    border-top: 1px solid var(--border-subtle);
  }
</style>
