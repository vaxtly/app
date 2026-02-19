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
  class="cb"
  class:cb--checked={checked}
  class:cb--disabled={disabled}
  role="checkbox"
  aria-checked={checked}
  aria-disabled={disabled}
  tabindex={disabled ? -1 : 0}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <span class="cb-box">
    {#if checked}
      <svg class="cb-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    {/if}
  </span>
</span>

<style>
  .cb {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }

  .cb:focus-visible .cb-box {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand-500) 40%, transparent);
  }

  .cb--disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }

  .cb-box {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1.5px solid var(--color-surface-500);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
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

  .cb-icon {
    color: white;
    animation: cb-check-in 0.15s ease-out;
  }

  @keyframes cb-check-in {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
