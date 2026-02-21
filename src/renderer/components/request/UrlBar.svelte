<script lang="ts">
  import { HTTP_METHODS } from '../../../shared/constants'
  import { getMethodColor } from '../../lib/utils/http-colors'
  import VarInput from '../shared/VarInput.svelte'

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
  let varInput: { focus: () => void } | undefined

  // Method dropdown state
  let methodOpen = $state(false)
  let triggerEl = $state<HTMLButtonElement | null>(null)
  let dropdownEl = $state<HTMLDivElement | null>(null)
  let dropdownPos = $state({ top: 0, left: 0 })

  function openMethodDropdown(): void {
    if (!triggerEl) return
    const rect = triggerEl.getBoundingClientRect()
    dropdownPos = { top: rect.bottom + 4, left: rect.left }
    methodOpen = true
    requestAnimationFrame(() => {
      // Focus first item or selected item for keyboard nav
      const selected = dropdownEl?.querySelector('[data-selected]') as HTMLElement
      selected?.focus()
    })
  }

  function selectMethod(m: string): void {
    onmethodchange(m)
    methodOpen = false
    triggerEl?.focus()
  }

  function handleDropdownKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      methodOpen = false
      triggerEl?.focus()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = [...(dropdownEl?.querySelectorAll('[role="option"]') ?? [])] as HTMLElement[]
      const current = items.findIndex((el) => el === document.activeElement)
      const next = e.key === 'ArrowDown'
        ? (current + 1) % items.length
        : (current - 1 + items.length) % items.length
      items[next]?.focus()
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const focused = document.activeElement as HTMLElement
      focused?.click()
    }
  }

  function handleTriggerKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMethodDropdown()
    }
  }

  function handleClickOutside(e: MouseEvent): void {
    if (!methodOpen) return
    if (triggerEl?.contains(e.target as Node)) return
    if (dropdownEl?.contains(e.target as Node)) return
    methodOpen = false
  }

  $effect(() => {
    if (methodOpen) {
      document.addEventListener('mousedown', handleClickOutside, true)
      return () => document.removeEventListener('mousedown', handleClickOutside, true)
    }
  })

  async function handleSave(): Promise<void> {
    await onsave()
    saveFeedback = 'Saved'
    setTimeout(() => saveFeedback = '', 1200)
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      onsend()
    }
  }

  export function focus(): void {
    varInput?.focus()
  }
</script>

<div class="url-bar">
  <div class="url-bar-inner">
    <!-- Method selector -->
    <div class="method-wrap">
      <button
        bind:this={triggerEl}
        onclick={openMethodDropdown}
        onkeydown={handleTriggerKeydown}
        class="method-trigger"
        style:color={getMethodColor(method)}
        aria-haspopup="listbox"
        aria-expanded={methodOpen}
      >
        <span class="method-text">{method}</span>
        <svg class="method-chevron" class:method-chevron--open={methodOpen} width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
        </svg>
      </button>
      <span class="method-led {method}"></span>
    </div>

    <!-- URL input with variable highlight -->
    <VarInput
      bind:this={varInput}
      value={url}
      oninput={(e) => onurlchange((e.target as HTMLInputElement).value)}
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

<!-- Method dropdown (fixed to escape overflow clipping) -->
{#if methodOpen}
  <div
    bind:this={dropdownEl}
    class="method-dropdown"
    style="top: {dropdownPos.top}px; left: {dropdownPos.left}px"
    role="listbox"
    tabindex="-1"
    aria-label="HTTP Method"
    onkeydown={handleDropdownKeydown}
  >
    {#each HTTP_METHODS as m}
      <button
        role="option"
        aria-selected={m === method}
        data-selected={m === method ? '' : undefined}
        class="method-item"
        class:method-item--active={m === method}
        onclick={() => selectMethod(m)}
        tabindex={-1}
      >
        <span class="method-item-led" style="background: var(--color-method-{m.toLowerCase()})"></span>
        <span class="method-item-label" style:color={getMethodColor(m)}>{m}</span>
        {#if m === method}
          <svg class="method-item-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        {/if}
      </button>
    {/each}
  </div>
{/if}

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
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .url-bar-inner:focus-within {
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-brand-500) 20%, transparent);
  }

  /* --- Method trigger button --- */
  .method-wrap {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    border-right: 1px solid var(--color-surface-600);
  }

  .method-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 12px;
    height: 38px;
    width: 90px;
    border: none;
    background: color-mix(in srgb, var(--color-surface-900) 50%, transparent);
    cursor: pointer;
    outline: none;
    transition: background 0.15s;
  }

  .method-trigger:hover {
    background: color-mix(in srgb, var(--color-surface-700) 50%, transparent);
  }

  .method-text {
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    letter-spacing: 0.02em;
  }

  .method-chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 0.15s, opacity 0.15s;
  }

  .method-chevron--open {
    transform: rotate(180deg);
  }

  .method-trigger:hover .method-chevron {
    opacity: 0.8;
  }

  .method-led {
    position: absolute;
    right: 10px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    pointer-events: none;
    transition: background 0.2s, box-shadow 0.2s;
    display: none;
  }

  .method-led.GET { background: var(--color-method-get); box-shadow: 0 0 6px color-mix(in srgb, var(--color-method-get) 50%, transparent); }
  .method-led.POST { background: var(--color-method-post); box-shadow: 0 0 6px color-mix(in srgb, var(--color-method-post) 40%, transparent); }
  .method-led.PUT { background: var(--color-method-put); box-shadow: 0 0 6px color-mix(in srgb, var(--color-method-put) 40%, transparent); }
  .method-led.PATCH { background: var(--color-method-patch); box-shadow: 0 0 6px color-mix(in srgb, var(--color-method-patch) 40%, transparent); }
  .method-led.DELETE { background: var(--color-method-delete); box-shadow: 0 0 6px color-mix(in srgb, var(--color-method-delete) 50%, transparent); }
  .method-led.HEAD { background: var(--color-method-head); box-shadow: 0 0 6px color-mix(in srgb, var(--color-method-head) 40%, transparent); }
  .method-led.OPTIONS { background: var(--color-method-options); box-shadow: none; }

  /* --- Method dropdown --- */
  .method-dropdown {
    position: fixed;
    z-index: 100;
    min-width: 120px;
    padding: 4px;
    background: var(--color-surface-800);
    border: 1px solid var(--color-surface-600);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.15);
    animation: dropdown-in 0.12s ease-out;
  }

  @keyframes dropdown-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .method-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    outline: none;
    transition: background 0.1s;
  }

  .method-item:hover,
  .method-item:focus-visible {
    background: var(--color-surface-700);
  }

  .method-item--active {
    background: color-mix(in srgb, var(--color-surface-700) 50%, transparent);
  }

  .method-item-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .method-item-label {
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    letter-spacing: 0.02em;
    flex: 1;
    text-align: left;
  }

  .method-item-check {
    flex-shrink: 0;
    color: var(--color-brand-400);
  }

  /* --- URL input --- */
  :global(.url-input) {
    position: relative;
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border: none;
    background: transparent;
    color: var(--color-surface-100);
    font-size: 13px;
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
    outline: none;
  }

  :global(.url-input::placeholder) {
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
    border-radius: var(--radius-xl);
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
    color: var(--color-success);
    border-color: color-mix(in srgb, var(--color-success) 30%, var(--color-surface-600));
    background: color-mix(in srgb, var(--color-success) 8%, var(--color-surface-800));
    cursor: pointer;
  }

  .btn-save--active:hover {
    background: color-mix(in srgb, var(--color-success) 15%, var(--color-surface-800));
    border-color: color-mix(in srgb, var(--color-success) 50%, var(--color-surface-600));
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 15%, transparent);
  }

  .btn-save--saved {
    color: var(--color-success);
    border-color: color-mix(in srgb, var(--color-success) 40%, var(--color-surface-600));
    background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface-800));
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
    font-family: var(--font-mono);
    font-feature-settings: var(--font-feature-mono);
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
    background: color-mix(in srgb, var(--color-danger) 10%, transparent);
    color: var(--color-danger-light);
    border-left: 1px solid color-mix(in srgb, var(--color-danger) 20%, var(--color-surface-600));
  }

  .btn-cancel:hover {
    background: color-mix(in srgb, var(--color-danger) 20%, transparent);
    color: var(--color-danger-lighter);
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
