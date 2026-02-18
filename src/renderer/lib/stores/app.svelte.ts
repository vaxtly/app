/**
 * Core application store — workspace, tabs, sidebar, active request state.
 * Uses Svelte 5 runes for fine-grained reactivity.
 */

import type { Request, ResponseData, Workspace } from '../../lib/types'

// --- Types ---

export type TabType = 'request' | 'environment'

export interface Tab {
  id: string
  type: TabType
  entityId: string // request ID or environment ID
  label: string
  method?: string // For request tabs
  pinned: boolean
  isUnsaved: boolean
}

export interface TabRequestState {
  // Cached request state per tab (so switching tabs preserves unsaved edits)
  name: string
  method: string
  url: string
  headers: string | null
  query_params: string | null
  body: string | null
  body_type: string
  auth: string | null
  scripts: string | null
  response: ResponseData | null
  loading: boolean
}

type SidebarMode = 'collections' | 'environments'

// --- State ---

let workspaces = $state<Workspace[]>([])
let activeWorkspaceId = $state<string | null>(null)
let openTabs = $state<Tab[]>([])
let activeTabId = $state<string | null>(null)
let sidebarCollapsed = $state(false)
let sidebarMode = $state<SidebarMode>('collections')
let sidebarSearch = $state('')
let showSettings = $state(false)

// Per-tab request state cache (reactive object so $derived tracks changes)
let tabStates = $state<Record<string, TabRequestState>>({})

// --- Derived ---

const activeTab = $derived(openTabs.find((t) => t.id === activeTabId) ?? null)
const activeWorkspace = $derived(workspaces.find((w) => w.id === activeWorkspaceId) ?? null)

// --- Actions ---

function setWorkspaces(list: Workspace[]): void {
  workspaces = list
}

function setActiveWorkspace(id: string): void {
  activeWorkspaceId = id
}

async function createWorkspace(name: string): Promise<Workspace> {
  const ws = await window.api.workspaces.create({ name })
  workspaces = [...workspaces, ws]
  return ws
}

async function renameWorkspace(id: string, name: string): Promise<void> {
  await window.api.workspaces.update(id, { name })
  workspaces = workspaces.map((w) => (w.id === id ? { ...w, name } : w))
}

async function deleteWorkspace(id: string): Promise<void> {
  await window.api.workspaces.delete(id)
  workspaces = workspaces.filter((w) => w.id !== id)
}

function openRequestTab(request: Request): void {
  // Check if tab already exists
  const existing = openTabs.find((t) => t.type === 'request' && t.entityId === request.id)
  if (existing) {
    activeTabId = existing.id
    return
  }

  const tab: Tab = {
    id: `tab-${request.id}`,
    type: 'request',
    entityId: request.id,
    label: request.name,
    method: request.method,
    pinned: false,
    isUnsaved: false,
  }

  openTabs = [...openTabs, tab]
  activeTabId = tab.id

  // Initialize tab state from saved request
  tabStates[tab.id] = {
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers,
    query_params: request.query_params,
    body: request.body,
    body_type: request.body_type,
    auth: request.auth,
    scripts: request.scripts,
    response: null,
    loading: false,
  }
}

function closeTab(tabId: string): void {
  const tab = openTabs.find((t) => t.id === tabId)
  if (!tab || tab.pinned) return

  const index = openTabs.indexOf(tab)
  openTabs = openTabs.filter((t) => t.id !== tabId)
  delete tabStates[tabId]

  if (activeTabId === tabId) {
    // Activate the nearest tab
    if (openTabs.length > 0) {
      const newIndex = Math.min(index, openTabs.length - 1)
      activeTabId = openTabs[newIndex].id
    } else {
      activeTabId = null
    }
  }
}

function closeOtherTabs(keepTabId: string): void {
  const keep = openTabs.filter((t) => t.id === keepTabId || t.pinned)
  const removing = openTabs.filter((t) => t.id !== keepTabId && !t.pinned)
  for (const t of removing) {
    delete tabStates[t.id]
  }
  openTabs = keep
  if (!openTabs.find((t) => t.id === activeTabId)) {
    activeTabId = keepTabId
  }
}

function closeAllTabs(): void {
  const unpinned = openTabs.filter((t) => !t.pinned)
  for (const t of unpinned) {
    delete tabStates[t.id]
  }
  openTabs = openTabs.filter((t) => t.pinned)
  if (openTabs.length > 0) {
    activeTabId = openTabs[0].id
  } else {
    activeTabId = null
  }
}

function togglePinTab(tabId: string): void {
  openTabs = openTabs.map((t) => (t.id === tabId ? { ...t, pinned: !t.pinned } : t))
}

function setActiveTab(tabId: string): void {
  activeTabId = tabId
}

function nextTab(): void {
  if (openTabs.length === 0) return
  const index = openTabs.findIndex((t) => t.id === activeTabId)
  const next = (index + 1) % openTabs.length
  activeTabId = openTabs[next].id
}

function prevTab(): void {
  if (openTabs.length === 0) return
  const index = openTabs.findIndex((t) => t.id === activeTabId)
  const prev = (index - 1 + openTabs.length) % openTabs.length
  activeTabId = openTabs[prev].id
}

function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed
}

function setSidebarMode(mode: SidebarMode): void {
  sidebarMode = mode
}

function setSidebarSearch(query: string): void {
  sidebarSearch = query
}

function openSettings(): void {
  showSettings = true
}

function closeSettings(): void {
  showSettings = false
}

function getTabState(tabId: string): TabRequestState | undefined {
  return tabStates[tabId]
}

function updateTabState(tabId: string, partial: Partial<TabRequestState>): void {
  const current = tabStates[tabId]
  if (!current) return
  tabStates[tabId] = { ...current, ...partial }

  // Mark tab as unsaved if any data fields changed
  if ('method' in partial || 'url' in partial || 'headers' in partial || 'body' in partial || 'auth' in partial || 'body_type' in partial || 'scripts' in partial) {
    openTabs = openTabs.map((t) =>
      t.id === tabId ? { ...t, isUnsaved: true, method: partial.method ?? t.method, label: partial.name ?? t.label } : t
    )
  }
}

function markTabSaved(tabId: string): void {
  openTabs = openTabs.map((t) => (t.id === tabId ? { ...t, isUnsaved: false } : t))
}

function openEnvironmentTab(env: { id: string; name: string }): void {
  const existing = openTabs.find((t) => t.type === 'environment' && t.entityId === env.id)
  if (existing) {
    activeTabId = existing.id
    return
  }

  const tab: Tab = {
    id: `tab-env-${env.id}`,
    type: 'environment',
    entityId: env.id,
    label: env.name,
    pinned: false,
    isUnsaved: false,
  }

  openTabs = [...openTabs, tab]
  activeTabId = tab.id
}

function updateTabLabel(tabId: string, label: string, method?: string): void {
  openTabs = openTabs.map((t) => (t.id === tabId ? { ...t, label, method: method ?? t.method } : t))
}

// --- Export reactive getters + actions ---

export const appStore = {
  get workspaces() { return workspaces },
  get activeWorkspaceId() { return activeWorkspaceId },
  get activeWorkspace() { return activeWorkspace },
  get openTabs() { return openTabs },
  get activeTabId() { return activeTabId },
  get activeTab() { return activeTab },
  get sidebarCollapsed() { return sidebarCollapsed },
  get sidebarMode() { return sidebarMode },
  get sidebarSearch() { return sidebarSearch },
  get showSettings() { return showSettings },

  setWorkspaces,
  setActiveWorkspace,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  openRequestTab,
  openEnvironmentTab,
  closeTab,
  closeOtherTabs,
  closeAllTabs,
  togglePinTab,
  setActiveTab,
  nextTab,
  prevTab,
  toggleSidebar,
  setSidebarMode,
  setSidebarSearch,
  openSettings,
  closeSettings,
  getTabState,
  updateTabState,
  markTabSaved,
  updateTabLabel,
}
