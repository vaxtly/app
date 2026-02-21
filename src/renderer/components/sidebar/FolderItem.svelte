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
      await collectionsStore.renameFolder(node.id, trimmed)
    }
    renaming = false
  }

  function handleRenameKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') renaming = false
  }

  async function addSubfolder(): Promise<void> {
    await collectionsStore.createFolder(node.collectionId, 'New Folder', node.id)
  }

  async function addRequest(): Promise<void> {
    const req = await collectionsStore.createRequest(node.collectionId, 'New Request', node.id)
    onrequestclick(req.id)
  }

  async function handleDelete(): Promise<void> {
    await collectionsStore.deleteFolder(node.id)
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
      await window.api.requests.move(dragging.id, node.id, node.collectionId)
      await collectionsStore.reloadCollection(sourceCollectionId)
      if (sourceCollectionId !== node.collectionId) {
        await collectionsStore.reloadCollection(node.collectionId)
      }
      syncAfterMove(sourceCollectionId, node.collectionId)
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

  let syncEnabled = $derived(collectionsStore.getCollectionById(node.collectionId)?.sync_enabled === 1)

  async function pushCollection(): Promise<void> {
    try {
      const findings = await window.api.sync.scanSensitive(node.collectionId)
      if (findings.length > 0) {
        sensitiveFindings = findings
        showSensitiveModal = true
        return
      }
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushCollection(node.collectionId, false, wsId)
      await collectionsStore.reloadCollection(node.collectionId)
    } catch {
      // Handled by sync service / session log
    }
  }

  async function pushAnyway(): Promise<void> {
    showSensitiveModal = false
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushCollection(node.collectionId, false, wsId)
      await collectionsStore.reloadCollection(node.collectionId)
    } catch {
      // Handled by sync service / session log
    }
  }

  async function pushSanitized(): Promise<void> {
    showSensitiveModal = false
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushCollection(node.collectionId, true, wsId)
      await collectionsStore.reloadCollection(node.collectionId)
    } catch {
      // Handled by sync service / session log
    }
  }

  async function pullCollection(): Promise<void> {
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pullCollection(node.collectionId, wsId)
      await collectionsStore.reloadCollection(node.collectionId)
    } catch {
      // Handled by sync service / session log
    }
  }

  let contextMenuItems = $derived([
    { label: 'Add Request', action: addRequest, icon: 'M12 4.5v15m7.5-7.5h-15' },
    { label: 'Add Subfolder', action: addSubfolder, icon: 'M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z' },
    { label: 'Rename', action: startRename, icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z' },
    { label: 'Set Environments', action: () => { showEnvModal = true }, icon: 'M4.745 3A23.933 23.933 0 003 12c0 3.183.62 6.22 1.745 9M19.255 3C20.38 5.78 21 8.817 21 12s-.62 6.22-1.745 9m-13.51 0A23.933 23.933 0 0012 21c2.478 0 4.852-.474 7.022-1.332M12 3a23.918 23.918 0 01-5.745 9A23.918 23.918 0 0012 21m0-18a23.918 23.918 0 005.745 9A23.918 23.918 0 0012 21M12 3v18M3 12h18' },
    ...(syncEnabled ? [
      { label: '', action: () => {}, separator: true },
      { label: 'Push to Remote', action: pushCollection, icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5' },
      { label: 'Pull from Remote', action: pullCollection, icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3' },
    ] : []),
    { label: '', action: () => {}, separator: true },
    { label: 'Delete', action: handleDelete, danger: true, icon: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' },
  ])
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="group" oncontextmenu={handleContextMenu} ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-left transition-all duration-150 {isDropTarget ? 'border border-brand-500 bg-brand-500/10' : 'hover:bg-[var(--tint-hover)]'}"
    role="button"
    tabindex="0"
    aria-expanded={node.expanded}
    onclick={handleToggle}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle() } }}
  >
    <svg
      class="h-3 w-3 shrink-0 text-surface-500 transition-transform {node.expanded ? 'rotate-90' : ''}"
      fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>

    <svg class="h-3 w-3 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>

    {#if renaming}
      <input
        bind:this={inputEl}
        bind:value={renameValue}
        onblur={commitRename}
        onkeydown={handleRenameKeydown}
        class="h-5 min-w-0 flex-1 rounded-md border border-brand-500/50 bg-[var(--tint-muted)] px-1 text-xs text-surface-100 outline-none"
      />
    {:else}
      <span class="min-w-0 flex-1 truncate text-[13px] text-surface-300">
        {node.name}
      </span>
    {/if}

    <button
      onclick={(e) => { e.stopPropagation(); addRequest() }}
      aria-label="Add request to folder"
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-surface-500 opacity-0 transition-all duration-150 hover:bg-[var(--tint-active)] hover:text-brand-400 group-hover:opacity-100"
    >
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
</div>

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
  <EnvironmentAssociationModal targetId={node.id} targetType="folder" onclose={() => { showEnvModal = false }} />
{/if}

{#if showSensitiveModal}
  <SensitiveDataModal
    findings={sensitiveFindings}
    onclose={() => { showSensitiveModal = false }}
    onsyncanyway={pushAnyway}
    onsyncwithout={pushSanitized}
  />
{/if}
