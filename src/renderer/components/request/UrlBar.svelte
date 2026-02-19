<script lang="ts">
  import { HTTP_METHODS } from '../../../shared/constants'
  import { METHOD_COLORS } from '../../lib/utils/http-colors'

  interface Props {
    method: string
    url: string
    loading: boolean
    unsaved: boolean
    onmethodchange: (method: string) => void
    onurlchange: (url: string) => void
    onsend: () => void
    oncancel: () => void
    onsave: () => void
  }

  let { method, url, loading, unsaved, onmethodchange, onurlchange, onsend, oncancel, onsave }: Props = $props()

  let saveFeedback = $state('')

  async function handleSave(): Promise<void> {
    await onsave()
    saveFeedback = 'Saved'
    setTimeout(() => saveFeedback = '', 1200)
  }

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
        <div class="cancel-ring">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" stroke-dasharray="56.5" stroke-linecap="round" class="ring-track"/>
          </svg>
        </div>
        <span class="btn-label">Stop</span>
      </button>
    {:else}
      <button onclick={onsend} disabled={!url.trim()} class="btn-send">
        <svg class="send-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
        <span class="btn-label">Send</span>
      </button>
    {/if}
  </div>

  <!-- Save (outside the pill) -->
  <button
    onclick={handleSave}
    disabled={!unsaved && !saveFeedback}
    class="btn-save"
    class:btn-save--active={unsaved}
    class:btn-save--saved={!!saveFeedback}
    title="Save (Cmd+S)"
  >
    {#if saveFeedback}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    {:else}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
    {/if}
  </button>
</div>

<style>
  .url-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
  }

  .url-bar-inner {
    flex: 1;
    min-width: 0;
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

  /* --- Save button --- */
  .btn-save {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--color-surface-600);
    border-radius: 10px;
    background: var(--color-surface-800);
    color: var(--color-surface-500);
    cursor: default;
    flex-shrink: 0;
    transition: color 0.2s, background 0.2s, border-color 0.2s, box-shadow 0.2s;
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn-save--active {
    color: #4ade80;
    border-color: color-mix(in srgb, #4ade80 30%, var(--color-surface-600));
    background: color-mix(in srgb, #4ade80 8%, var(--color-surface-800));
    cursor: pointer;
  }

  .btn-save--active:hover {
    background: color-mix(in srgb, #4ade80 15%, var(--color-surface-800));
    border-color: color-mix(in srgb, #4ade80 50%, var(--color-surface-600));
    box-shadow: 0 0 8px color-mix(in srgb, #4ade80 15%, transparent);
  }

  .btn-save--saved {
    color: #4ade80;
    border-color: color-mix(in srgb, #4ade80 40%, var(--color-surface-600));
    background: color-mix(in srgb, #4ade80 12%, var(--color-surface-800));
    cursor: default;
  }

  /* --- Send / Cancel buttons --- */
  .btn-send, .btn-cancel {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 16px 0 14px;
    height: 38px;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .btn-label {
    font-size: 11px;
    font-weight: 700;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* --- Send --- */
  .btn-send {
    background: color-mix(in srgb, var(--color-brand-600) 10%, transparent);
    color: var(--color-brand-400);
    border-left: 1px solid color-mix(in srgb, var(--color-brand-500) 20%, var(--color-surface-600));
  }

  .btn-send:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-brand-600) 20%, transparent);
    color: var(--color-brand-300);
  }

  .btn-send:active:not(:disabled) {
    background: color-mix(in srgb, var(--color-brand-600) 28%, transparent);
  }

  .btn-send:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .send-arrow {
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }

  .btn-send:hover:not(:disabled) .send-arrow {
    transform: translateX(2px);
  }

  /* --- Cancel --- */
  .btn-cancel {
    background: color-mix(in srgb, #ef4444 10%, transparent);
    color: #f87171;
    border-left: 1px solid color-mix(in srgb, #ef4444 20%, var(--color-surface-600));
  }

  .btn-cancel:hover {
    background: color-mix(in srgb, #ef4444 20%, transparent);
    color: #fca5a5;
  }

  .cancel-ring {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    animation: ring-spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .ring-track {
    stroke-dashoffset: 14;
    animation: ring-chase 1.2s ease-in-out infinite;
  }

  @keyframes ring-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes ring-chase {
    0% { stroke-dashoffset: 42; }
    50% { stroke-dashoffset: 10; }
    100% { stroke-dashoffset: 42; }
  }
</style>
