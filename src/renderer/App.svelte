<script lang="ts">
  import { onMount } from 'svelte'
  import Sidebar from './components/layout/Sidebar.svelte'
  import TabBar from './components/layout/TabBar.svelte'
  import RequestBuilder from './components/request/RequestBuilder.svelte'
  import EnvironmentEditor from './components/environment/EnvironmentEditor.svelte'
  import SystemLog from './components/layout/SystemLog.svelte'
  import SettingsModal from './components/settings/SettingsModal.svelte'
  import WelcomeGuide from './components/modals/WelcomeGuide.svelte'
  import { appStore } from './lib/stores/app.svelte'
  import { collectionsStore } from './lib/stores/collections.svelte'
  import { environmentsStore } from './lib/stores/environments.svelte'
  import { settingsStore } from './lib/stores/settings.svelte'

  // Track the active RequestBuilder for save/send shortcuts
  let activeBuilder: { save: () => Promise<void>; send: () => Promise<void> } | undefined
  let showWelcome = $state(false)

  // Active request ID for system log history tab
  let activeRequestId = $derived(
    appStore.activeTab?.type === 'request' ? appStore.activeTab.entityId : undefined,
  )

  function handleRequestClick(requestId: string): void {
    const request = collectionsStore.getRequestById(requestId)
    if (request) {
      appStore.openRequestTab(request)
    }
  }

  function handleEnvironmentClick(environmentId: string): void {
    const env = environmentsStore.getById(environmentId)
    if (env) {
      appStore.openEnvironmentTab({ id: env.id, name: env.name })
    }
  }

  async function handleNewRequest(): Promise<void> {
    // Create request in first collection, or create a collection first
    let collections = collectionsStore.collections
    if (collections.length === 0) {
      await collectionsStore.createCollection('My Collection', appStore.activeWorkspaceId ?? undefined)
      collections = collectionsStore.collections
    }
    if (collections.length > 0) {
      const req = await collectionsStore.createRequest(collections[0].id, 'New Request')
      handleRequestClick(req.id)
    }
  }

  async function handleSave(): Promise<void> {
    if (activeBuilder) {
      await activeBuilder.save()
    }
  }

  async function handleSend(): Promise<void> {
    if (activeBuilder) {
      await activeBuilder.send()
    }
  }

  onMount(async () => {
    // Load settings
    await settingsStore.loadAll()

    // Show welcome guide on first launch
    if (!settingsStore.get('app.welcomed')) {
      showWelcome = true
    }

    // Load workspaces and set default
    const workspaces = await window.api.workspaces.list()
    appStore.setWorkspaces(workspaces)
    if (workspaces.length > 0) {
      appStore.setActiveWorkspace(workspaces[0].id)
      await collectionsStore.loadAll(workspaces[0].id)
      await environmentsStore.loadAll(workspaces[0].id)
    }

    // Menu event listeners
    const cleanups = [
      window.api.on.menuNewRequest(handleNewRequest),
      window.api.on.menuSaveRequest(handleSave),
    ]

    // Global keyboard shortcuts
    function handleKeydown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'n') {
        e.preventDefault()
        handleNewRequest()
      } else if (mod && e.key === 's') {
        e.preventDefault()
        handleSave()
      } else if (mod && e.key === 'w') {
        e.preventDefault()
        if (appStore.activeTabId) {
          appStore.closeTab(appStore.activeTabId)
        }
      } else if (mod && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      } else if (mod && e.key === 'b') {
        e.preventDefault()
        appStore.toggleSidebar()
      } else if (mod && e.key === ',') {
        e.preventDefault()
        appStore.openSettings()
      } else if (mod && e.key === 'l') {
        e.preventDefault()
        // Focus URL input — the active RequestBuilder will handle this
      } else if (e.ctrlKey && e.key === 'PageDown') {
        e.preventDefault()
        appStore.nextTab()
      } else if (e.ctrlKey && e.key === 'PageUp') {
        e.preventDefault()
        appStore.prevTab()
      }
    }

    document.addEventListener('keydown', handleKeydown)

    return () => {
      cleanups.forEach((fn) => fn())
      document.removeEventListener('keydown', handleKeydown)
    }
  })
</script>

<div class="flex h-screen flex-col bg-surface-900">
  <!-- Main content: sidebar + tab area -->
  <div class="flex min-h-0 flex-1">
    <!-- Sidebar -->
    {#if !appStore.sidebarCollapsed}
      <div class="w-60 shrink-0 border-r border-surface-700">
        <Sidebar onrequestclick={handleRequestClick} onenvironmentclick={handleEnvironmentClick} />
      </div>
    {/if}

    <!-- Main area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Drag region (non-Mac or when sidebar collapsed) -->
      {#if navigator.platform.includes('Mac')}
        <div class="drag-region shrink-0" style="height: 2rem"></div>
      {:else if appStore.sidebarCollapsed}
        <div class="drag-region h-2 shrink-0"></div>
      {/if}

      <!-- Tab bar -->
      <TabBar />

      <!-- Content area -->
      <div class="min-h-0 flex-1 overflow-hidden">
        {#if appStore.activeTab}
          {#key appStore.activeTabId}
            {#if appStore.activeTab.type === 'request'}
              <RequestBuilder
                bind:this={activeBuilder}
                tabId={appStore.activeTab.id}
                requestId={appStore.activeTab.entityId}
              />
            {:else if appStore.activeTab.type === 'environment'}
              <EnvironmentEditor
                tabId={appStore.activeTab.id}
                environmentId={appStore.activeTab.entityId}
              />
            {/if}
          {/key}
        {:else}
          <!-- Empty state -->
          <div class="flex h-full items-center justify-center">
            <div class="text-center">
              <svg class="mx-auto mb-4 h-16 w-16 text-surface-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="0.5">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h2 class="text-lg font-semibold text-surface-400">Vaxtly</h2>
              <p class="mt-1 text-sm text-surface-500">Create or open a request to get started</p>
              <div class="mt-4 flex items-center justify-center gap-4 text-xs text-surface-600">
                <span><kbd class="rounded bg-surface-800 px-1.5 py-0.5 text-surface-400">Cmd+N</kbd> New request</span>
                <span><kbd class="rounded bg-surface-800 px-1.5 py-0.5 text-surface-400">Cmd+B</kbd> Toggle sidebar</span>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- System log panel -->
      <SystemLog {activeRequestId} />
    </div>
  </div>

  <SettingsModal open={appStore.showSettings} onclose={() => appStore.closeSettings()} />
  <WelcomeGuide open={showWelcome} onclose={() => { showWelcome = false }} />
</div>
