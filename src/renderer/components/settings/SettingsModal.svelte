<script lang="ts">
  import DataTab from './DataTab.svelte'
  import FeedbackTab from './FeedbackTab.svelte'
  import GeneralTab from './GeneralTab.svelte'
  import RemoteSyncTab from './RemoteSyncTab.svelte'
  import VaultTab from './VaultTab.svelte'

  interface Props {
    open: boolean
    onclose: () => void
  }

  let { open, onclose }: Props = $props()

  type SettingsTab = 'general' | 'data' | 'remote' | 'vault' | 'feedback'

  const tabs: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'general', label: 'General', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { key: 'data', label: 'Data', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
    { key: 'remote', label: 'Remote Sync', icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4' },
    { key: 'vault', label: 'Vault', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { key: 'feedback', label: 'Feedback', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]

  let activeTab = $state<SettingsTab>('general')

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onclose()
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="settings-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    role="dialog"
    aria-modal="true"
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <button class="absolute inset-0" onclick={onclose} aria-label="Close"></button>

    <!-- Modal -->
    <div class="settings-modal relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col bg-surface-900">
      <!-- Header -->
      <div class="settings-header flex shrink-0 items-center justify-between px-4 py-3">
        <h2 class="text-sm font-semibold text-surface-200">Settings</h2>
        <button onclick={onclose} class="text-surface-500 hover:text-surface-200" aria-label="Close">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Tab navigation -->
      <div class="settings-tabs flex shrink-0 gap-1 px-4">
        {#each tabs as tab}
          <button
            onclick={() => { activeTab = tab.key }}
            class="flex items-center gap-1.5 px-3 py-2 text-xs transition-colors {activeTab === tab.key
              ? 'border-b-2 border-brand-500 text-brand-400'
              : 'text-surface-400 hover:text-surface-200'}"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-y-auto p-4">
        {#if activeTab === 'general'}
          <GeneralTab />
        {:else if activeTab === 'data'}
          <DataTab />
        {:else if activeTab === 'remote'}
          <RemoteSyncTab />
        {:else if activeTab === 'vault'}
          <VaultTab />
        {:else if activeTab === 'feedback'}
          <FeedbackTab />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-backdrop {
    animation: modal-backdrop-in 0.15s ease-out;
  }

  .settings-modal {
    border-radius: var(--radius-2xl);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-xl);
    animation: modal-content-in 0.2s ease-out;
  }

  .settings-header {
    border-bottom: 1px solid var(--border-subtle);
  }

  .settings-tabs {
    border-bottom: 1px solid var(--border-subtle);
  }
</style>
