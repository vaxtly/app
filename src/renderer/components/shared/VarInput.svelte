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
    onpaste?: (e: ClipboardEvent) => void
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
    onpaste,
  }: Props = $props()

  const getResolvedVars = getContext<(() => Record<string, ResolvedVariable>) | undefined>('resolvedVars')

  const VAR_REGEX = /\{\{([\w\-.]+)\}\}/g

  let inputEl = $state<HTMLInputElement | null>(null)
  let scrollLeft = $state(0)

  // Tooltip state
  let tooltip = $state<{ varName: string; info: ResolvedVariable; x: number; y: number } | null>(null)
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  // Canvas for text measurement (lazily created)
  let measureCtx: CanvasRenderingContext2D | null = null

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

  // --- Input handlers ---
  function handleInput(e: Event): void {
    oninput?.((e.target as HTMLInputElement).value)
    syncScroll()
  }

  function syncScroll(): void {
    if (inputEl) scrollLeft = inputEl.scrollLeft
  }

  // --- Tooltip via character-position measurement ---
  function getMeasureCtx(): CanvasRenderingContext2D | null {
    if (measureCtx) return measureCtx
    const canvas = document.createElement('canvas')
    measureCtx = canvas.getContext('2d')
    return measureCtx
  }

  function getCharIndexAtX(mouseX: number): number {
    if (!inputEl) return -1
    const ctx = getMeasureCtx()
    if (!ctx) return -1

    const style = getComputedStyle(inputEl)
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

    const rect = inputEl.getBoundingClientRect()
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const borderLeft = parseFloat(style.borderLeftWidth) || 0
    const textX = mouseX - rect.left - paddingLeft - borderLeft + inputEl.scrollLeft

    if (textX < 0) return 0

    // Binary search for character index
    let lo = 0
    let hi = value.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      const w = ctx.measureText(value.slice(0, mid + 1)).width
      if (w < textX) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo
  }

  function getSegmentAtIndex(charIndex: number): { varName: string } | null {
    let offset = 0
    for (const seg of segments) {
      const end = offset + seg.text.length
      if (charIndex >= offset && charIndex < end && seg.varName) {
        return { varName: seg.varName }
      }
      offset = end
    }
    return null
  }

  function handleMouseMove(e: MouseEvent): void {
    if (!getResolvedVars || type === 'password') return

    // Once tooltip is showing, cancel any pending hide and skip re-evaluation
    if (tooltip) {
      clearTimeout(hideTimer)
      return
    }

    const charIndex = getCharIndexAtX(e.clientX)
    const seg = getSegmentAtIndex(charIndex)

    if (!seg) {
      clearTimeout(hoverTimer)
      return
    }

    const resolved = getResolvedVars()
    const info = resolved[seg.varName]
    if (!info) {
      clearTimeout(hoverTimer)
      return
    }

    clearTimeout(hoverTimer)
    clearTimeout(hideTimer)

    const mouseX = e.clientX
    const mouseY = e.clientY
    hoverTimer = setTimeout(() => {
      if (!inputEl) return
      tooltip = { varName: seg.varName, info, x: mouseX, y: mouseY }
    }, 1000)
  }

  function handleMouseLeave(): void {
    clearTimeout(hoverTimer)
    hideTimer = setTimeout(() => { tooltip = null }, 200)
  }

  function handleTooltipEnter(): void {
    clearTimeout(hideTimer)
  }

  function handleTooltipLeave(): void {
    hideTimer = setTimeout(() => { tooltip = null }, 200)
  }

  export function focus(): void {
    inputEl?.focus()
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
      oninput={handleInput}
      {onkeydown}
      {onpaste}
    />
  </div>
{:else}
  <div class="vi-wrap relative min-w-0 flex-1">
    {#if hasVars}
      <div class="vi-highlight {className}" aria-hidden="true">
        <span class="vi-highlight-inner" style="transform: translateX({-scrollLeft}px)">
          {#each segments as seg, i (i)}
            {#if seg.type === 'resolved'}
              <span class="vi-var--resolved">{seg.text}</span>
            {:else if seg.type === 'unresolved'}
              <span class="vi-var--unresolved">{seg.text}</span>
            {:else}
              {seg.text}
            {/if}
          {/each}
        </span>
      </div>
    {/if}
    <input
      bind:this={inputEl}
      type="text"
      {value}
      {placeholder}
      {readonly}
      {id}
      class="{className}{hasVars ? ' vi-input--has-vars' : ''}"
      oninput={handleInput}
      {onkeydown}
      {onpaste}
      onscroll={syncScroll}
      onkeyup={syncScroll}
      onclick={syncScroll}
      onmousemove={handleMouseMove}
      onmouseleave={handleMouseLeave}
      spellcheck="false"
    />
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
  .vi-wrap {
    position: relative;
  }

  .vi-highlight {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    white-space: nowrap;
    display: flex;
    align-items: center;
  }

  .vi-highlight-inner {
    white-space: nowrap;
  }

  .vi-var--resolved {
    color: var(--color-var-resolved);
  }

  .vi-var--unresolved {
    color: var(--color-var-unresolved);
  }

  /* When variables present: make input text transparent but keep caret visible */
  :global(.vi-input--has-vars) {
    color: transparent !important;
    caret-color: var(--color-surface-100);
  }

  :global(.vi-input--has-vars::selection) {
    color: transparent;
    background: Highlight;
  }

  .vi-tooltip {
    transform: translate(-50%, calc(-100% - 8px));
    animation: vi-tooltip-in 0.12s ease-out;
  }

  /* Bridge the 8px gap so the mouse can reach the tooltip without triggering hide */
  .vi-tooltip::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -8px;
    height: 8px;
  }

  @keyframes vi-tooltip-in {
    from { opacity: 0; transform: translate(-50%, calc(-100% - 4px)); }
    to   { opacity: 1; transform: translate(-50%, calc(-100% - 8px)); }
  }
</style>
