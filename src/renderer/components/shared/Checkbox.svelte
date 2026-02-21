<script lang="ts">
  interface Props {
    checked?: boolean
    disabled?: boolean
    onchange?: (checked: boolean) => void
  }

  let { checked = false, disabled = false, onchange }: Props = $props()

  function handleClick(): void {
    if (disabled) return
    onchange?.(!checked)
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (disabled) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onchange?.(!checked)
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="cb inline-flex shrink-0 cursor-pointer items-center outline-none"
  class:cb--checked={checked}
  class:cb--disabled={disabled}
  role="checkbox"
  aria-checked={checked}
  aria-disabled={disabled}
  tabindex={disabled ? -1 : 0}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <span class="cb-box flex h-4 w-4 items-center justify-center rounded-sm border-[1.5px] border-surface-500 bg-transparent transition-[background,border-color,transform] duration-150 ease-out">
    {#if checked}
      <svg class="text-white animate-[cb-check-in_0.15s_ease-out]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    {/if}
  </span>
</span>

<style>
  .cb--disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }

  .cb:focus-visible .cb-box {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand-500) 40%, transparent);
  }

  .cb:hover:not(.cb--disabled) .cb-box {
    border-color: var(--color-surface-300);
  }

  .cb--checked .cb-box {
    background: var(--color-brand-500);
    border-color: var(--color-brand-500);
  }

  .cb--checked:hover:not(.cb--disabled) .cb-box {
    background: var(--color-brand-400);
    border-color: var(--color-brand-400);
  }

  .cb--checked:active:not(.cb--disabled) .cb-box {
    transform: scale(0.9);
  }

  @keyframes cb-check-in {
    from { opacity: 0; transform: scale(0.5); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
