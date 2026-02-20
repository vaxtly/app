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
    oninput?: (e: Event) => void
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

  let mirrorEl = $state<HTMLDivElement | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)

  // Tooltip state
  let tooltip = $state<{ varName: string; info: ResolvedVariable; x: number; y: number } | null>(null)
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  function syncScroll(): void {
    if (mirrorEl && inputEl) {
      mirrorEl.scrollLeft = inputEl.scrollLeft
    }
  }

  // Also sync when input gets focus (scroll may change)
  function handleFocus(): void {
    requestAnimationFrame(syncScroll)
  }

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
    // Small delay before hiding so user can move to tooltip
    hideTimer = setTimeout(() => { tooltip = null }, 200)
  }

  function handleTooltipEnter(): void {
    clearTimeout(hideTimer)
  }

  function handleTooltipLeave(): void {
    tooltip = null
  }

  function handleVarClick(): void {
    inputEl?.focus()
  }

  export function focus(): void {
    inputEl?.focus()
  }
</script>

<div class="var-input-wrap">
  <input
    bind:this={inputEl}
    {type}
    {value}
    {placeholder}
    {readonly}
    {id}
    class="{className}{hasVars ? ' var-input--transparent' : ''}"
    {oninput}
    {onkeydown}
    onscroll={syncScroll}
    onfocus={handleFocus}
  />
  {#if hasVars}
    <!-- Mirror on top for hover detection on variable spans -->
    <div bind:this={mirrorEl} class="var-input-mirror {className}" aria-hidden="true">
      <span class="var-input-mirror-text">{#each segments as seg}{#if seg.type === 'resolved'}<span
        class="vi-var vi-resolved"
        role="presentation"
        onmouseenter={(e) => handleVarEnter(e, seg.varName!)}
        onmouseleave={handleVarLeave}
        onclick={handleVarClick}
      >{seg.text}</span>{:else if seg.type === 'unresolved'}<span class="vi-var vi-unresolved">{seg.text}</span>{:else}<span class="vi-passthrough">{seg.text}</span>{/if}{/each}</span>
    </div>
  {/if}
</div>

<!-- Tooltip (rendered at body level via fixed positioning) -->
{#if tooltip}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="vi-tooltip"
    style="left: {tooltip.x}px; top: {tooltip.y}px;"
    onmouseenter={handleTooltipEnter}
    onmouseleave={handleTooltipLeave}
  >
    <div class="vi-tooltip-source">{tooltip.info.source}</div>
    <div class="vi-tooltip-value">{tooltip.info.value}</div>
  </div>
{/if}

<style>
  .var-input-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  /* Mirror sits on top of input for hover detection */
  .var-input-mirror {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    pointer-events: none;
    color: var(--color-surface-100);
    z-index: 1;
  }

  .var-input-mirror-text {
    white-space: pre;
    overflow: hidden;
  }

  /* Variable spans capture pointer events for tooltip hover */
  .vi-var {
    pointer-events: auto;
    cursor: text;
    border-radius: 2px;
  }

  .vi-resolved {
    color: var(--color-var-resolved);
    background: var(--color-var-resolved-bg);
  }

  .vi-unresolved {
    color: var(--color-var-unresolved);
    background: var(--color-var-unresolved-bg);
  }

  /* Non-variable text: visible but passes pointer events through to input */
  .vi-passthrough {
    pointer-events: none;
  }

  :global(.var-input--transparent) {
    color: transparent !important;
    caret-color: var(--color-surface-100);
  }

  /* --- Tooltip --- */
  .vi-tooltip {
    position: fixed;
    z-index: 1000;
    transform: translate(-50%, calc(-100% - 8px));
    background: var(--color-surface-800);
    border: 1px solid var(--color-surface-600);
    border-radius: 8px;
    padding: 6px 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    pointer-events: auto;
    animation: vi-tooltip-in 0.12s ease-out;
    max-width: 320px;
    user-select: text;
    -webkit-user-select: text;
  }

  @keyframes vi-tooltip-in {
    from { opacity: 0; transform: translate(-50%, calc(-100% - 4px)); }
    to   { opacity: 1; transform: translate(-50%, calc(-100% - 8px)); }
  }

  .vi-tooltip-source {
    font-size: 10px;
    color: var(--color-surface-400);
    margin-bottom: 2px;
    white-space: nowrap;
  }

  .vi-tooltip-value {
    font-size: 12px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    color: var(--color-var-resolved);
    word-break: break-all;
    cursor: text;
  }
</style>
