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
  class="toggle inline-flex shrink-0 cursor-pointer items-center outline-none"
  class:toggle--checked={checked}
  class:toggle--disabled={disabled}
  role="checkbox"
  aria-checked={checked}
  aria-disabled={disabled}
  tabindex={disabled ? -1 : 0}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <span class="toggle-track relative h-4 w-7 rounded-full bg-surface-600 transition-colors duration-200">
    <span class="toggle-knob absolute top-0.5 left-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-surface-200 shadow-sm">
      {#if checked}
        <svg class="text-brand-500" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      {/if}
    </span>
  </span>
</span>

<style>
  .toggle--disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .toggle:focus-visible .toggle-track {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand-500) 40%, transparent);
  }

  .toggle--checked .toggle-track {
    background: var(--color-brand-500);
  }

  .toggle-knob {
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
  }

  .toggle--checked .toggle-knob {
    transform: translateX(12px);
    background: white;
  }
</style>
