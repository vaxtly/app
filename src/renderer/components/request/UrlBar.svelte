<script lang="ts">
  import { HTTP_METHODS } from '../../../shared/constants'
  import { METHOD_COLORS } from '../../lib/utils/http-colors'

  interface Props {
    method: string
    url: string
    loading: boolean
    onmethodchange: (method: string) => void
    onurlchange: (url: string) => void
    onsend: () => void
    oncancel: () => void
  }

  let { method, url, loading, onmethodchange, onurlchange, onsend, oncancel }: Props = $props()

  let urlInput: HTMLInputElement

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      onsend()
    }
  }

  export function focus(): void {
    urlInput?.focus()
  }
</script>

<div class="url-bar">
  <div class="url-bar-inner">
    <!-- Method selector -->
    <div class="method-wrap">
      <select
        value={method}
        onchange={(e) => onmethodchange(e.currentTarget.value)}
        class="method-select {METHOD_COLORS[method] ?? ''}"
      >
        {#each HTTP_METHODS as m}
          <option value={m} class="method-option">{m}</option>
        {/each}
      </select>
      <span class="method-led {method}"></span>
    </div>

    <!-- URL input -->
    <input
      bind:this={urlInput}
      type="text"
      value={url}
      oninput={(e) => onurlchange(e.currentTarget.value)}
      onkeydown={handleKeydown}
      placeholder="Enter request URL..."
      class="url-input"
    />

    <!-- Send / Cancel -->
    {#if loading}
      <button onclick={oncancel} class="btn-cancel">
        <svg class="btn-icon spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="32" stroke-dashoffset="8"/>
        </svg>
        Cancel
      </button>
    {:else}
      <button onclick={onsend} disabled={!url.trim()} class="btn-send">
        <svg class="btn-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
        Send
      </button>
    {/if}
  </div>
</div>

<style>
  .url-bar {
    padding: 10px 12px;
  }

  .url-bar-inner {
    display: flex;
    align-items: center;
    gap: 0;
    background: var(--color-surface-800);
    border: 1px solid var(--color-surface-600);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .url-bar-inner:focus-within {
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-brand-500) 20%, transparent);
  }

  /* --- Method selector --- */
  .method-wrap {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    border-right: 1px solid var(--color-surface-600);
  }

  .method-select {
    appearance: none;
    padding: 0 28px 0 12px;
    height: 38px;
    border: none;
    background: color-mix(in srgb, var(--color-surface-900) 50%, transparent);
    font-size: 12px;
    font-weight: 700;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    letter-spacing: 0.02em;
    cursor: pointer;
    outline: none;
    transition: background 0.15s;
  }

  .method-select:hover {
    background: color-mix(in srgb, var(--color-surface-700) 50%, transparent);
  }

  .method-option {
    background: var(--color-surface-800);
    color: var(--color-surface-200);
  }

  .method-led {
    position: absolute;
    right: 10px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    pointer-events: none;
    transition: background 0.2s, box-shadow 0.2s;
  }

  .method-led.GET { background: #4ade80; box-shadow: 0 0 6px rgba(74, 222, 128, 0.5); }
  .method-led.POST { background: #facc15; box-shadow: 0 0 6px rgba(250, 204, 21, 0.4); }
  .method-led.PUT { background: #60a5fa; box-shadow: 0 0 6px rgba(96, 165, 250, 0.4); }
  .method-led.PATCH { background: #fb923c; box-shadow: 0 0 6px rgba(251, 146, 60, 0.4); }
  .method-led.DELETE { background: #f87171; box-shadow: 0 0 6px rgba(248, 113, 113, 0.5); }
  .method-led.HEAD { background: #c084fc; box-shadow: 0 0 6px rgba(192, 132, 252, 0.4); }
  .method-led.OPTIONS { background: var(--color-surface-400); box-shadow: none; }

  /* --- URL input --- */
  .url-input {
    flex: 1;
    min-width: 0;
    height: 38px;
    padding: 0 12px;
    border: none;
    background: transparent;
    color: var(--color-surface-100);
    font-size: 13px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    outline: none;
  }

  .url-input::placeholder {
    color: var(--color-surface-500);
    font-family: inherit;
  }

  /* --- Buttons --- */
  .btn-send, .btn-cancel {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 18px;
    height: 38px;
    border: none;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-send {
    background: var(--color-brand-600);
    color: white;
  }

  .btn-send:hover:not(:disabled) {
    background: var(--color-brand-500);
  }

  .btn-send:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn-cancel {
    background: #dc2626;
    color: white;
  }

  .btn-cancel:hover {
    background: #ef4444;
  }

  .btn-icon {
    flex-shrink: 0;
  }

  .spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
