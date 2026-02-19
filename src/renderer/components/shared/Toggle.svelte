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
  class="toggle"
  class:toggle--checked={checked}
  class:toggle--disabled={disabled}
  role="checkbox"
  aria-checked={checked}
  aria-disabled={disabled}
  tabindex={disabled ? -1 : 0}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <span class="toggle-track">
    <span class="toggle-knob">
      {#if checked}
        <svg class="toggle-icon" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      {/if}
    </span>
  </span>
</span>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }

  .toggle:focus-visible .toggle-track {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand-500) 40%, transparent);
  }

  .toggle--disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .toggle-track {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: var(--color-surface-600);
    transition: background 0.2s ease;
  }

  .toggle--checked .toggle-track {
    background: var(--color-brand-500);
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-surface-200);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .toggle--checked .toggle-knob {
    transform: translateX(12px);
    background: white;
  }

  .toggle-icon {
    color: var(--color-brand-500);
  }
</style>
