<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import Sidebar from './components/layout/Sidebar.svelte'
  import TabBar from './components/layout/TabBar.svelte'
  import RequestBuilder from './components/request/RequestBuilder.svelte'
  import EnvironmentEditor from './components/environment/EnvironmentEditor.svelte'
  import SystemLog from './components/layout/SystemLog.svelte'
  import SettingsModal from './components/settings/SettingsModal.svelte'
  import WelcomeGuide from './components/modals/WelcomeGuide.svelte'
  import UserManual from './components/help/UserManual.svelte'
  import { appStore } from './lib/stores/app.svelte'
  import { collectionsStore } from './lib/stores/collections.svelte'
  import { environmentsStore } from './lib/stores/environments.svelte'
  import { settingsStore } from './lib/stores/settings.svelte'

  // Track the active RequestBuilder for save/send shortcuts
  let activeBuilder: { save: () => Promise<void>; send: () => Promise<void> } | undefined
  let showWelcome = $state(false)
  let sessionRestored = $state(false)

  // --- Update notification state ---
  let updateAvailable: { version: string; releaseName: string } | null = $state(null)
  let updateDownloaded = $state(false)
  let updateProgress: number | null = $state(null)
  let updateDismissed = $state(false)
  const isMac = navigator.userAgent.includes('Macintosh')

  function dismissUpdate(): void {
    updateDismissed = true
  }

  function copyBrewCommand(): void {
    navigator.clipboard.writeText('brew upgrade vaxtly')
  }

  function restartToUpdate(): void {
    window.api.updater.install()
  }

  // --- Session persistence ---

  interface PersistedSession {
    tabs: Array<{ type: 'request' | 'environment'; entityId: string; pinned: boolean }>
    activeEntityId: string | null
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function saveSession(): void {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const session: PersistedSession = {
        tabs: appStore.openTabs.map((t) => ({ type: t.type, entityId: t.entityId, pinned: t.pinned })),
        activeEntityId: appStore.activeTab?.entityId ?? null,
      }
      const wsId = appStore.activeWorkspaceId
      const sessionKey = wsId ? `session.tabs.${wsId}` : 'session.tabs'
      window.api.settings.set(sessionKey, JSON.stringify(session))
    }, 500)
  }

  $effect(() => {
    // Track tab list and active tab — triggers on any change
    void appStore.openTabs.length
    void appStore.activeTabId
    if (sessionRestored) saveSession()
  })

  // Auto-reveal active tab's entity in the sidebar + apply default environment
  $effect(() => {
    const tab = appStore.activeTab
    if (!tab) return
    if (tab.type === 'request') {
      appStore.setSidebarMode('collections')
      collectionsStore.revealRequest(tab.entityId)

      // Auto-activate default environment only on tab switch — read activeEnvironmentId
      // without tracking it so user selections don't re-trigger this effect
      const defaultEnvId = collectionsStore.resolveDefaultEnvironment(tab.entityId)
      if (defaultEnvId) {
        const currentEnvId = untrack(() => environmentsStore.activeEnvironmentId)
        if (defaultEnvId !== currentEnvId) {
          environmentsStore.activate(defaultEnvId, appStore.activeWorkspaceId ?? undefined)
        }
      }
    } else if (tab.type === 'environment') {
      appStore.setSidebarMode('environments')
    }
  })

  async function restoreSession(): Promise<void> {
    try {
      const wsId = appStore.activeWorkspaceId
      const sessionKey = wsId ? `session.tabs.${wsId}` : 'session.tabs'
      const raw = await window.api.settings.get(sessionKey)
      if (!raw) return
      const session: PersistedSession = JSON.parse(raw)
      if (!Array.isArray(session.tabs)) return

      for (const saved of session.tabs) {
        if (saved.type === 'request') {
          const req = collectionsStore.getRequestById(saved.entityId)
          if (req) {
            appStore.openRequestTab(req)
            if (saved.pinned) appStore.togglePinTab(`tab-${saved.entityId}`)
          }
        } else if (saved.type === 'environment') {
          const env = environmentsStore.getById(saved.entityId)
          if (env) {
            appStore.openEnvironmentTab({ id: env.id, name: env.name })
            if (saved.pinned) appStore.togglePinTab(`tab-env-${saved.entityId}`)
          }
        }
      }

      // Restore active tab
      if (session.activeEntityId) {
        const tab = appStore.openTabs.find((t) => t.entityId === session.activeEntityId)
        if (tab) appStore.setActiveTab(tab.id)
      }
    } catch {
      // Corrupted session data — start fresh
    }
  }

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
      await restoreSession()
    }
    sessionRestored = true

    // Menu event listeners
    const cleanups = [
      window.api.on.menuNewRequest(handleNewRequest),
      window.api.on.menuSaveRequest(handleSave),
      window.api.on.menuOpenSettings(() => appStore.openSettings()),
      window.api.on.menuOpenManual(() => appStore.openManual()),
      window.api.on.menuCheckUpdates(() => window.api.updater.check()),
      window.api.on.updateAvailable((data) => {
        updateAvailable = data
        updateDismissed = false
      }),
      window.api.on.updateProgress((data) => {
        updateProgress = data.percent
      }),
      window.api.on.updateDownloaded(() => {
        updateDownloaded = true
        updateProgress = null
      }),
      window.api.on.updateError(() => {
        // Silently ignore update errors — don't disrupt the user
      }),
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
      } else if (e.key === 'F1') {
        e.preventDefault()
        appStore.openManual()
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
      clearTimeout(saveTimer)
    }
  })
</script>

<div class="flex h-screen flex-col bg-surface-900">
  <!-- Update notification banner -->
  {#if updateAvailable && !updateDismissed}
    <div class="update-banner">
      {#if isMac}
        <span class="update-text">
          Vaxtly v{updateAvailable.version} is available — run
          <code class="update-code">brew upgrade vaxtly</code>
          to update
        </span>
        <button class="update-btn" onclick={copyBrewCommand}>Copy command</button>
      {:else if updateDownloaded}
        <span class="update-text">
          Vaxtly v{updateAvailable.version} is ready — restart to update
        </span>
        <button class="update-btn update-btn-primary" onclick={restartToUpdate}>Restart now</button>
      {:else if updateProgress !== null}
        <span class="update-text">
          Downloading Vaxtly v{updateAvailable.version}… {Math.round(updateProgress)}%
        </span>
        <div class="update-progress-track">
          <div class="update-progress-bar" style="width: {updateProgress}%"></div>
        </div>
      {:else}
        <span class="update-text">
          Vaxtly v{updateAvailable.version} is available
        </span>
      {/if}
      <button class="update-dismiss" onclick={dismissUpdate} aria-label="Dismiss">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M4 4l8 8M12 4l-8 8"/>
        </svg>
      </button>
    </div>
  {/if}

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
      {#if window.navigator.userAgent.includes('Macintosh')}
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

  <UserManual open={appStore.showManual} onclose={() => appStore.closeManual()} />
  <SettingsModal open={appStore.showSettings} onclose={() => appStore.closeSettings()} />
  <WelcomeGuide open={showWelcome} onclose={() => { showWelcome = false }} />
</div>

<style>
  .update-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    background: color-mix(in srgb, var(--color-brand-500) 12%, var(--color-surface-800));
    border-bottom: 1px solid color-mix(in srgb, var(--color-brand-500) 25%, transparent);
    font-size: 12px;
    color: var(--color-surface-200);
    flex-shrink: 0;
  }
  .update-text {
    flex: 1;
    min-width: 0;
  }
  .update-code {
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--color-surface-700);
    font-family: monospace;
    font-size: 11px;
    color: var(--color-brand-300);
  }
  .update-btn {
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid var(--color-surface-600);
    background: var(--color-surface-700);
    color: var(--color-surface-200);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .update-btn:hover {
    background: var(--color-surface-600);
  }
  .update-btn-primary {
    border-color: var(--color-brand-500);
    background: color-mix(in srgb, var(--color-brand-500) 25%, var(--color-surface-700));
    color: var(--color-brand-200);
  }
  .update-btn-primary:hover {
    background: color-mix(in srgb, var(--color-brand-500) 40%, var(--color-surface-700));
  }
  .update-progress-track {
    width: 100px;
    height: 4px;
    border-radius: 2px;
    background: var(--color-surface-700);
    overflow: hidden;
    flex-shrink: 0;
  }
  .update-progress-bar {
    height: 100%;
    border-radius: 2px;
    background: var(--color-brand-400);
    transition: width 0.3s ease;
  }
  .update-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-surface-400);
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.12s;
  }
  .update-dismiss:hover {
    color: var(--color-surface-200);
  }
  .update-dismiss svg {
    width: 14px;
    height: 14px;
  }
</style>
