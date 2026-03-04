/**
 * Core application store — workspace, tabs, sidebar, active request state.
 * Uses Svelte 5 runes for fine-grained reactivity.
 */

import type { Request, ResponseData, Workspace, SSEEvent, McpToolCallResult, McpResourceReadResult, McpPromptGetResult } from '../../lib/types'

// --- Types ---

export type TabType = 'request' | 'environment' | 'mcp' | 'websocket'

export interface Tab {
  id: string
  type: TabType
  entityId: string // request ID or environment ID
  label: string
  method?: string // For request tabs
  pinned: boolean
  isUnsaved: boolean
  isDraft: boolean
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
  bodyCache?: Record<string, string | null>
  auth: string | null
  scripts: string | null
  response: ResponseData | null
  loading: boolean
  activeSubTab?: string
  streaming?: boolean
  sseEvents?: SSEEvent[]
  sseBody?: string
  sseMetrics?: {
    eventCount: number
    duration: number
    size: number
    startTime: number
  }
}

export interface TabEnvironmentState {
  name: string
  variables: Array<{ key: string; value: string; enabled: boolean }>
  isDirty: boolean
  initialized: boolean
}

export type McpLeftTab = 'tools' | 'resources' | 'prompts'
export type McpRightTab = 'response' | 'traffic' | 'notifications'

export interface McpLastResponse {
  type: 'tool' | 'resource' | 'prompt'
  name: string
  result?: McpToolCallResult | McpResourceReadResult | McpPromptGetResult
  error?: string
  loading: boolean
  timestamp: number
}

export interface TabMcpState {
  serverId: string
  activeLeftTab: McpLeftTab
  activeRightTab: McpRightTab
  lastResponse: McpLastResponse | null
}

export interface TabWebSocketState {
  name: string
  url: string
  headers: string | null
  protocols: string | null
  composerMessage: string
  composerType: 'text' | 'json'
}

type SidebarMode = 'collections' | 'environments' | 'mcp'

// --- State ---

let workspaces = $state<Workspace[]>([])
let activeWorkspaceId = $state<string | null>(null)
let openTabs = $state<Tab[]>([])
let activeTabId = $state<string | null>(null)
let sidebarCollapsed = $state(false)
let sidebarWidth = $state(244)
let sidebarMode = $state<SidebarMode>('collections')
let sidebarSearch = $state('')
let showSettings = $state(false)

// Per-tab request state cache (reactive object so $derived tracks changes)
let tabStates = $state<Record<string, TabRequestState>>({})

// Per-tab environment state cache (parallel to tabStates for env tabs)
let envTabStates = $state<Record<string, TabEnvironmentState>>({})

// Per-tab MCP state cache
let mcpTabStates = $state<Record<string, TabMcpState>>({})

// Per-tab WebSocket state cache
let wsTabStates = $state<Record<string, TabWebSocketState>>({})

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
    isDraft: false,
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

let draftCounter = 0

function openDraftTab(): void {
  const draftId = `draft-${++draftCounter}-${Date.now()}`
  const tab: Tab = {
    id: `tab-${draftId}`,
    type: 'request',
    entityId: draftId,
    label: 'New Request',
    method: 'GET',
    pinned: false,
    isUnsaved: true,
    isDraft: true,
  }

  openTabs = [...openTabs, tab]
  activeTabId = tab.id

  tabStates[tab.id] = {
    name: 'New Request',
    method: 'GET',
    url: '',
    headers: null,
    query_params: null,
    body: null,
    body_type: 'none',
    auth: null,
    scripts: null,
    response: null,
    loading: false,
  }
}

function promoteDraft(draftTabId: string, request: Request): void {
  const newTabId = `tab-${request.id}`

  // Copy tab state from draft key to new key
  const draftState = tabStates[draftTabId]
  if (draftState) {
    tabStates[newTabId] = { ...draftState }
    delete tabStates[draftTabId]
  }

  // Replace the draft tab in-place
  openTabs = openTabs.map((t) =>
    t.id === draftTabId
      ? {
          ...t,
          id: newTabId,
          entityId: request.id,
          label: request.name,
          method: request.method,
          isUnsaved: false,
          isDraft: false,
        }
      : t
  )

  // Update activeTabId if it was pointing at the draft
  if (activeTabId === draftTabId) {
    activeTabId = newTabId
  }
}

function closeTab(tabId: string): void {
  const tab = openTabs.find((t) => t.id === tabId)
  if (!tab || tab.pinned) return

  const index = openTabs.indexOf(tab)
  openTabs = openTabs.filter((t) => t.id !== tabId)
  delete tabStates[tabId]
  delete envTabStates[tabId]
  delete mcpTabStates[tabId]
  delete wsTabStates[tabId]

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
    delete envTabStates[t.id]
    delete mcpTabStates[t.id]
    delete wsTabStates[t.id]
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
    delete envTabStates[t.id]
    delete mcpTabStates[t.id]
    delete wsTabStates[t.id]
  }
  openTabs = openTabs.filter((t) => t.pinned)
  if (openTabs.length > 0) {
    activeTabId = openTabs[0].id
  } else {
    activeTabId = null
  }
}

function reorderTabs(fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) return
  if (fromIndex < 0 || fromIndex >= openTabs.length) return
  if (toIndex < 0 || toIndex > openTabs.length) return
  const updated = [...openTabs]
  const [moved] = updated.splice(fromIndex, 1)
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex
  updated.splice(insertAt, 0, moved)
  openTabs = updated
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

function setSidebarWidth(w: number): void {
  sidebarWidth = Math.min(400, Math.max(180, w))
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
    isDraft: false,
  }

  openTabs = [...openTabs, tab]
  activeTabId = tab.id

  // Initialize env tab state (component will fill in data on first mount)
  envTabStates[tab.id] = {
    name: env.name,
    variables: [],
    isDirty: false,
    initialized: false,
  }
}

function updateTabLabel(tabId: string, label: string, method?: string): void {
  openTabs = openTabs.map((t) => (t.id === tabId ? { ...t, label, method: method ?? t.method } : t))
  const state = tabStates[tabId]
  if (state) {
    tabStates[tabId] = { ...state, name: label }
  }
}

function getEnvTabState(tabId: string): TabEnvironmentState | undefined {
  return envTabStates[tabId]
}

function updateEnvTabState(tabId: string, partial: Partial<TabEnvironmentState>): void {
  const current = envTabStates[tabId]
  if (!current) return
  envTabStates[tabId] = { ...current, ...partial }

  // Sync isUnsaved on tab when dirty flag changes
  if ('isDirty' in partial) {
    openTabs = openTabs.map((t) =>
      t.id === tabId ? { ...t, isUnsaved: partial.isDirty ?? t.isUnsaved } : t
    )
  }
}

function openMcpTab(server: { id: string; name: string }): void {
  const existing = openTabs.find((t) => t.type === 'mcp' && t.entityId === server.id)
  if (existing) {
    activeTabId = existing.id
    return
  }

  const tab: Tab = {
    id: `tab-mcp-${server.id}`,
    type: 'mcp',
    entityId: server.id,
    label: server.name,
    pinned: false,
    isUnsaved: false,
    isDraft: false,
  }

  openTabs = [...openTabs, tab]
  activeTabId = tab.id

  mcpTabStates[tab.id] = {
    serverId: server.id,
    activeLeftTab: 'tools',
    activeRightTab: 'response',
    lastResponse: null,
  }
}

function getMcpTabState(tabId: string): TabMcpState | undefined {
  return mcpTabStates[tabId]
}

function updateMcpTabState(tabId: string, partial: Partial<TabMcpState>): void {
  const current = mcpTabStates[tabId]
  if (!current) return
  mcpTabStates[tabId] = { ...current, ...partial }
}

function openWebSocketTab(request: { id: string; name: string; url: string; headers: string | null }): void {
  const existing = openTabs.find((t) => t.type === 'websocket' && t.entityId === request.id)
  if (existing) {
    activeTabId = existing.id
    return
  }

  const tab: Tab = {
    id: `tab-ws-${request.id}`,
    type: 'websocket',
    entityId: request.id,
    label: request.name,
    method: 'WEBSOCKET',
    pinned: false,
    isUnsaved: false,
    isDraft: false,
  }

  openTabs = [...openTabs, tab]
  activeTabId = tab.id

  wsTabStates[tab.id] = {
    name: request.name,
    url: request.url,
    headers: request.headers,
    protocols: null,
    composerMessage: '',
    composerType: 'text',
  }
}

function getWsTabState(tabId: string): TabWebSocketState | undefined {
  return wsTabStates[tabId]
}

function updateWsTabState(tabId: string, partial: Partial<TabWebSocketState>): void {
  const current = wsTabStates[tabId]
  if (!current) return
  wsTabStates[tabId] = { ...current, ...partial }

  // Mark unsaved if URL or headers changed
  if ('url' in partial || 'headers' in partial || 'protocols' in partial) {
    openTabs = openTabs.map((t) =>
      t.id === tabId ? { ...t, isUnsaved: true, label: partial.name ?? t.label } : t
    )
  }
}

function markWsTabSaved(tabId: string): void {
  openTabs = openTabs.map((t) => (t.id === tabId ? { ...t, isUnsaved: false } : t))
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
  get sidebarWidth() { return sidebarWidth },
  get sidebarMode() { return sidebarMode },
  get sidebarSearch() { return sidebarSearch },
  get showSettings() { return showSettings },

  setWorkspaces,
  setActiveWorkspace,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  openRequestTab,
  openDraftTab,
  promoteDraft,
  openEnvironmentTab,
  closeTab,
  closeOtherTabs,
  closeAllTabs,
  reorderTabs,
  togglePinTab,
  setActiveTab,
  nextTab,
  prevTab,
  toggleSidebar,
  setSidebarWidth,
  setSidebarMode,
  setSidebarSearch,
  openSettings,
  closeSettings,
  getTabState,
  updateTabState,
  markTabSaved,
  updateTabLabel,
  getEnvTabState,
  updateEnvTabState,
  openMcpTab,
  getMcpTabState,
  updateMcpTabState,
  openWebSocketTab,
  getWsTabState,
  updateWsTabState,
  markWsTabSaved,
}
