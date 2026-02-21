<script lang="ts">
  import { getContext } from 'svelte'
  import type { ResolvedVariable } from '../../lib/utils/variable-highlight'

  interface Props {
    type?: string
    value: string
    placeholder?: string
    readonly?: boolean
    id?: string
    class?: string
    oninput?: (value: string) => void
    onkeydown?: (e: KeyboardEvent) => void
  }

  let {
    type = 'text',
    value,
    placeholder = '',
    readonly = false,
    id,
    class: className = '',
    oninput,
    onkeydown,
  }: Props = $props()

  const getResolvedVars = getContext<(() => Record<string, ResolvedVariable>) | undefined>('resolvedVars')

  const VAR_REGEX = /\{\{([\w\-.]+)\}\}/g

  let editEl = $state<HTMLDivElement | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)

  // Tooltip state
  let tooltip = $state<{ varName: string; info: ResolvedVariable; x: number; y: number } | null>(null)
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  let segments = $derived.by(() => {
    if (!getResolvedVars || type === 'password') return []
    const resolved = getResolvedVars()
    const result: Array<{ text: string; varName?: string; type: 'text' | 'resolved' | 'unresolved' }> = []
    let lastIndex = 0
    VAR_REGEX.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = VAR_REGEX.exec(value)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: value.slice(lastIndex, match.index), type: 'text' })
      }
      const varName = match[1]
      result.push({
        text: match[0],
        varName,
        type: resolved[varName] ? 'resolved' : 'unresolved',
      })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < value.length) {
      result.push({ text: value.slice(lastIndex), type: 'text' })
    }
    return result
  })

  let hasVars = $derived(segments.some((s) => s.type !== 'text'))

  // --- Caret save/restore ---
  function getCaretOffset(el: HTMLElement): number {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return 0
    const range = sel.getRangeAt(0)
    const pre = document.createRange()
    pre.selectNodeContents(el)
    pre.setEnd(range.startContainer, range.startOffset)
    return pre.toString().length
  }

  function setCaretOffset(el: HTMLElement, offset: number): void {
    const sel = window.getSelection()
    if (!sel) return
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let remaining = offset
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      if (remaining <= node.length) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      remaining -= node.length
    }
    // Offset beyond end — place at end
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // --- Build innerHTML from segments ---
  function buildHighlightHTML(segs: typeof segments): string {
    if (segs.length === 0 || !segs.some((s) => s.type !== 'text')) {
      return escapeHTML(value)
    }
    let html = ''
    for (const seg of segs) {
      if (seg.type === 'resolved') {
        html += `<span class="vi-var vi-var--resolved">${escapeHTML(seg.text)}</span>`
      } else if (seg.type === 'unresolved') {
        html += `<span class="vi-var vi-var--unresolved">${escapeHTML(seg.text)}</span>`
      } else {
        html += escapeHTML(seg.text)
      }
    }
    return html
  }

  function escapeHTML(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // --- Sync DOM when value/segments change ---
  $effect(() => {
    if (!editEl || type === 'password') return
    // Depend on value and segments
    const html = buildHighlightHTML(segments)
    const currentText = editEl.textContent ?? ''

    // Only update DOM when text content actually diverges (avoids caret reset during round-trip)
    if (currentText !== value) {
      editEl.innerHTML = html
      // Don't restore caret if we're not focused
      if (document.activeElement === editEl) {
        // Caret was saved before the value prop change — try best-effort restore
        setCaretOffset(editEl, Math.min(savedCaret, value.length))
      }
    } else if (editEl.innerHTML !== html) {
      // Text matches but innerHTML differs — update highlights or strip leftover styled spans
      const caretPos = document.activeElement === editEl ? getCaretOffset(editEl) : -1
      editEl.innerHTML = html
      if (caretPos >= 0) {
        setCaretOffset(editEl, caretPos)
      }
    }
  })

  let savedCaret = 0

  function handleInput(): void {
    if (!editEl) return
    const text = editEl.textContent ?? ''
    savedCaret = getCaretOffset(editEl)
    oninput?.(text)
  }

  function handleKeydown(e: KeyboardEvent): void {
    // Prevent newlines
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
    }
    onkeydown?.(e)
  }

  function handlePaste(e: ClipboardEvent): void {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    // Strip newlines for single-line
    const clean = text.replace(/[\r\n]/g, '')
    document.execCommand('insertText', false, clean)
  }

  // --- Tooltip ---
  function handleVarEnter(e: MouseEvent, varName: string): void {
    clearTimeout(hideTimer)
    clearTimeout(hoverTimer)
    if (!getResolvedVars) return
    const info = getResolvedVars()[varName]
    if (!info) return

    hoverTimer = setTimeout(() => {
      const span = e.target as HTMLElement
      const rect = span.getBoundingClientRect()
      tooltip = { varName, info, x: rect.left + rect.width / 2, y: rect.top }
    }, 1000)
  }

  function handleVarLeave(): void {
    clearTimeout(hoverTimer)
    hideTimer = setTimeout(() => { tooltip = null }, 200)
  }

  function handleTooltipEnter(): void {
    clearTimeout(hideTimer)
  }

  function handleTooltipLeave(): void {
    tooltip = null
  }

  // Delegate hover events from the contenteditable to variable spans
  function handleMouseOver(e: MouseEvent): void {
    const target = e.target as HTMLElement
    if (target.classList.contains('vi-var--resolved')) {
      const varName = extractVarName(target.textContent ?? '')
      if (varName) handleVarEnter(e, varName)
    }
  }

  function handleMouseOut(e: MouseEvent): void {
    const target = e.target as HTMLElement
    if (target.classList.contains('vi-var')) {
      handleVarLeave()
    }
  }

  function extractVarName(text: string): string | null {
    const m = /^\{\{([\w\-.]+)\}\}$/.exec(text)
    return m ? m[1] : null
  }

  // --- Password input handler ---
  function handlePasswordInput(e: Event): void {
    oninput?.((e.target as HTMLInputElement).value)
  }

  export function focus(): void {
    if (type === 'password') {
      inputEl?.focus()
    } else {
      editEl?.focus()
    }
  }
</script>

{#if type === 'password'}
  <div class="relative min-w-0 flex-1">
    <input
      bind:this={inputEl}
      type="password"
      {value}
      {placeholder}
      {readonly}
      {id}
      class={className}
      oninput={handlePasswordInput}
      {onkeydown}
    />
  </div>
{:else}
  <div class="vi-wrap relative min-w-0 flex-1">
    <!-- svelte-ignore a11y_mouse_events_have_key_events -->
    <div
      bind:this={editEl}
      {id}
      class="{className} vi-editable whitespace-nowrap overflow-hidden outline-none"
      contenteditable={readonly ? 'false' : 'true'}
      role="textbox"
      tabindex="0"
      aria-readonly={readonly}
      spellcheck="false"
      oninput={handleInput}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
      onmouseover={handleMouseOver}
      onmouseout={handleMouseOut}
    ></div>
    {#if !value}
      <span class="{className} vi-placeholder absolute inset-0 pointer-events-none whitespace-nowrap overflow-hidden">{placeholder}</span>
    {/if}
  </div>
{/if}

<!-- Tooltip (rendered at body level via fixed positioning) -->
{#if tooltip}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="vi-tooltip fixed z-[1000] max-w-xs rounded-lg border border-surface-600 bg-surface-800 px-2.5 py-1.5 shadow-md pointer-events-auto select-text"
    style="left: {tooltip.x}px; top: {tooltip.y}px;"
    onmouseenter={handleTooltipEnter}
    onmouseleave={handleTooltipLeave}
  >
    <div class="mb-0.5 whitespace-nowrap text-[10px] text-surface-400">{tooltip.info.source}</div>
    <div class="cursor-text break-all font-mono text-xs text-var-resolved" style="font-feature-settings: var(--font-feature-mono)">{tooltip.info.value}</div>
  </div>
{/if}

<style>
  .vi-editable :global(.vi-var) {
    border-radius: 2px;
  }

  .vi-editable :global(.vi-var--resolved) {
    color: var(--color-var-resolved);
    background: var(--color-var-resolved-bg);
  }

  .vi-editable :global(.vi-var--unresolved) {
    color: var(--color-var-unresolved);
    background: var(--color-var-unresolved-bg);
  }

  .vi-placeholder {
    position: absolute;
    inset: 0;
    height: auto;
    width: auto;
    color: var(--color-surface-500);
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }

  .vi-tooltip {
    transform: translate(-50%, calc(-100% - 8px));
    animation: vi-tooltip-in 0.12s ease-out;
  }

  @keyframes vi-tooltip-in {
    from { opacity: 0; transform: translate(-50%, calc(-100% - 4px)); }
    to   { opacity: 1; transform: translate(-50%, calc(-100% - 8px)); }
  }
</style>
