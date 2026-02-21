<script lang="ts">
  import { collectionsStore, type TreeNode } from '../../lib/stores/collections.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { dragStore } from '../../lib/stores/drag.svelte'
  import ContextMenu from '../shared/ContextMenu.svelte'
  import EnvironmentAssociationModal from '../modals/EnvironmentAssociationModal.svelte'
  import SensitiveDataModal from '../modals/SensitiveDataModal.svelte'
  import FolderItem from './FolderItem.svelte'
  import RequestItem from './RequestItem.svelte'

  interface Props {
    node: TreeNode
    onrequestclick: (requestId: string) => void
  }

  let { node, onrequestclick }: Props = $props()

  let showEnvModal = $state(false)
  let sensitiveFindings = $state<{ source: string; requestName: string | null; requestId: string | null; field: string; key: string; maskedValue: string }[]>([])
  let showSensitiveModal = $state(false)
  let renaming = $state(false)
  let renameValue = $state('')
  let contextMenu = $state<{ x: number; y: number } | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)

  function handleToggle(): void {
    collectionsStore.toggleExpanded(node.id)
  }

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY }
  }

  function startRename(): void {
    renameValue = node.name
    renaming = true
    requestAnimationFrame(() => inputEl?.select())
  }

  async function commitRename(): Promise<void> {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      await collectionsStore.renameCollection(node.id, trimmed)
    }
    renaming = false
  }

  function handleRenameKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') renaming = false
  }

  async function addFolder(): Promise<void> {
    await collectionsStore.createFolder(node.id, 'New Folder')
  }

  async function addRequest(): Promise<void> {
    const req = await collectionsStore.createRequest(node.id, 'New Request')
    onrequestclick(req.id)
  }

  async function handleDelete(): Promise<void> {
    await collectionsStore.deleteCollection(node.id)
  }

  // Sync state from the raw collection data
  let collection = $derived(collectionsStore.getCollectionById(node.id))
  let syncEnabled = $derived(collection?.sync_enabled === 1)
  let isDirty = $derived(collection?.is_dirty === 1)

  async function toggleSync(): Promise<void> {
    if (!collection) return
    await window.api.collections.update(node.id, { sync_enabled: syncEnabled ? 0 : 1 })
    await collectionsStore.reloadCollection(node.id)
  }

  let isDropTarget = $derived(dragStore.dropTargetId === node.id)

  function handleDragOver(e: DragEvent): void {
    if (dragStore.dragging?.type === 'request' && dragStore.dragging.id !== node.id) {
      e.preventDefault()
      dragStore.setDropTarget(node.id)
    }
  }

  function handleDragLeave(): void {
    if (dragStore.dropTargetId === node.id) {
      dragStore.setDropTarget(null)
    }
  }

  async function handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault()
    dragStore.setDropTarget(null)
    const dragging = dragStore.dragging
    if (dragging?.type === 'request') {
      const sourceCollectionId = dragging.collectionId
      await window.api.requests.move(dragging.id, null, node.id)
      await collectionsStore.reloadCollection(sourceCollectionId)
      if (sourceCollectionId !== node.id) {
        await collectionsStore.reloadCollection(node.id)
      }
      syncAfterMove(sourceCollectionId, node.id)
    }
    dragStore.endDrag()
  }

  function syncAfterMove(sourceId: string, targetId: string): void {
    const wsId = appStore.activeWorkspaceId ?? undefined
    const source = collectionsStore.getCollectionById(sourceId)
    const target = sourceId !== targetId ? collectionsStore.getCollectionById(targetId) : null
    if (source?.sync_enabled) {
      window.api.sync.pushCollection(sourceId, false, wsId).catch(() => {})
    }
    if (target?.sync_enabled) {
      window.api.sync.pushCollection(targetId, false, wsId).catch(() => {})
    }
  }

  async function exportCollection(): Promise<void> {
    try {
      const data = await window.api.data.exportCollection(node.id)
      const json = JSON.stringify(data, null, 2)
      const slug = node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const date = new Date().toISOString().slice(0, 10)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vaxtly-collection-${slug}-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Handled by session log
    }
  }

  async function pushCollection(): Promise<void> {
    try {
      // Scan for sensitive data first
      const findings = await window.api.sync.scanSensitive(node.id)
      if (findings.length > 0) {
        sensitiveFindings = findings
        showSensitiveModal = true
        return
      }
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushCollection(node.id, false, wsId)
      await collectionsStore.reloadCollection(node.id)
    } catch {
      // Handled by sync service / session log
    }
  }

  async function pushAnyway(): Promise<void> {
    showSensitiveModal = false
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushCollection(node.id, false, wsId)
      await collectionsStore.reloadCollection(node.id)
    } catch {
      // Handled by sync service / session log
    }
  }

  async function pushSanitized(): Promise<void> {
    showSensitiveModal = false
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushCollection(node.id, true, wsId)
      await collectionsStore.reloadCollection(node.id)
    } catch {
      // Handled by sync service / session log
    }
  }

  let contextMenuItems = $derived([
    { label: 'Add Request', action: addRequest },
    { label: 'Add Folder', action: addFolder },
    { label: 'Rename', action: startRename },
    { label: '', action: () => {}, separator: true },
    { label: 'Set Environments', action: () => { showEnvModal = true } },
    { label: syncEnabled ? 'Disable Sync' : 'Enable Sync', action: toggleSync },
    ...(syncEnabled ? [{ label: 'Push to Remote', action: pushCollection }] : []),
    { label: 'Export', action: exportCollection },
    { label: '', action: () => {}, separator: true },
    { label: 'Delete', action: handleDelete, danger: true },
  ])
</script>

<!-- Collection header -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="group" oncontextmenu={handleContextMenu} ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-left transition-all duration-150 {isDropTarget ? 'border border-brand-500 bg-brand-500/10' : 'hover:bg-white/[0.05]'}"
    role="button"
    tabindex="0"
    aria-expanded={node.expanded}
    onclick={handleToggle}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle() } }}
  >
    <!-- Chevron -->
    <svg
      class="h-3.5 w-3.5 shrink-0 text-surface-500 transition-transform {node.expanded ? 'rotate-90' : ''}"
      fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>

    <!-- Sync indicator -->
    {#if syncEnabled}
      <svg class="h-3 w-3 shrink-0" style:color={isDirty ? 'var(--color-warning)' : 'var(--color-success)'} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" title={isDirty ? 'Unsaved changes' : 'Synced'}>
        <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    {:else}
      <!-- Folder icon -->
      <svg class="h-3.5 w-3.5 shrink-0 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    {/if}

    {#if renaming}
      <input
        bind:this={inputEl}
        bind:value={renameValue}
        onblur={commitRename}
        onkeydown={handleRenameKeydown}
        class="h-5 min-w-0 flex-1 rounded-md border border-brand-500/50 bg-white/[0.06] px-1 text-xs text-surface-100 outline-none"
      />
    {:else}
      <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-surface-200">
        {node.name}
      </span>
    {/if}

    <!-- Add button (visible on hover) -->
    <button
      onclick={(e) => { e.stopPropagation(); addRequest() }}
      aria-label="Add request to collection"
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-surface-500 opacity-0 transition-all duration-150 hover:bg-white/[0.08] hover:text-brand-400 group-hover:opacity-100"
    >
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
</div>

<!-- Children -->
{#if node.expanded}
  <div class="ml-3 pl-1" style="border-left: 1px solid var(--border-muted)">
    {#each node.children as child (child.id)}
      {#if child.type === 'folder'}
        <FolderItem node={child} {onrequestclick} />
      {:else if child.type === 'request'}
        <RequestItem node={child} {onrequestclick} />
      {/if}
    {/each}
  </div>
{/if}

{#if contextMenu}
  <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onclose={() => contextMenu = null} />
{/if}

{#if showEnvModal}
  <EnvironmentAssociationModal targetId={node.id} targetType="collection" onclose={() => { showEnvModal = false }} />
{/if}

{#if showSensitiveModal}
  <SensitiveDataModal
    findings={sensitiveFindings}
    onclose={() => { showSensitiveModal = false }}
    onsyncanyway={pushAnyway}
    onsyncwithout={pushSanitized}
  />
{/if}
