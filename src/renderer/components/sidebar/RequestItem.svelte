<script lang="ts">
  import { collectionsStore, type TreeNode } from '../../lib/stores/collections.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { dragStore } from '../../lib/stores/drag.svelte'
  import { getMethodColor } from '../../lib/utils/http-colors'
  import ContextMenu from '../shared/ContextMenu.svelte'
  import SensitiveDataModal from '../modals/SensitiveDataModal.svelte'

  interface Props {
    node: TreeNode
    onrequestclick: (requestId: string) => void
  }

  let { node, onrequestclick }: Props = $props()

  let renaming = $state(false)
  let renameValue = $state('')
  let contextMenu = $state<{ x: number; y: number } | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)
  let sensitiveFindings = $state<{ source: string; requestName: string | null; requestId: string | null; field: string; key: string; maskedValue: string }[]>([])
  let showSensitiveModal = $state(false)

  let isActive = $derived(
    appStore.activeTab?.type === 'request' && appStore.activeTab?.entityId === node.id
  )

  function handleClick(): void {
    onrequestclick(node.id)
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
      await collectionsStore.renameRequest(node.id, trimmed)
      // Update open tab label if this request has one
      const tab = appStore.openTabs.find((t) => t.entityId === node.id && t.type === 'request')
      if (tab) appStore.updateTabLabel(tab.id, trimmed)
    }
    renaming = false
  }

  function handleRenameKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') renaming = false
  }

  async function handleDelete(): Promise<void> {
    // Close the tab if open
    const tab = appStore.openTabs.find((t) => t.entityId === node.id)
    if (tab) appStore.closeTab(tab.id)
    await collectionsStore.deleteRequest(node.id)
  }

  async function duplicate(): Promise<void> {
    const original = collectionsStore.getRequestById(node.id)
    if (!original) return
    const req = await collectionsStore.createRequest(
      original.collection_id,
      `${original.name} (copy)`,
      original.folder_id ?? undefined
    )
    // Copy fields
    await window.api.requests.update(req.id, {
      method: original.method,
      url: original.url,
      headers: original.headers,
      query_params: original.query_params,
      body: original.body,
      body_type: original.body_type,
      auth: original.auth,
      scripts: original.scripts,
    })
    await collectionsStore.reloadCollection(original.collection_id)
    onrequestclick(req.id)
  }

  function handleDragStart(e: DragEvent): void {
    e.dataTransfer?.setData('text/plain', node.id)
    dragStore.startDrag({ type: 'request', id: node.id, collectionId: node.collectionId, parentId: node.parentId })
  }

  function handleDragEnd(): void {
    dragStore.endDrag()
  }

  let syncEnabled = $derived(collectionsStore.getCollectionById(node.collectionId)?.sync_enabled === 1)

  async function pushRequest(): Promise<void> {
    try {
      const findings = await window.api.sync.scanSensitive(node.collectionId)
      if (findings.length > 0) {
        sensitiveFindings = findings
        showSensitiveModal = true
        return
      }
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushRequest(node.collectionId, node.id, false, wsId)
      await collectionsStore.reloadCollection(node.collectionId)
    } catch {
      // Handled by sync service / session log
    }
  }

  async function pushRequestAnyway(): Promise<void> {
    showSensitiveModal = false
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushRequest(node.collectionId, node.id, false, wsId)
      await collectionsStore.reloadCollection(node.collectionId)
    } catch {
      // Handled by sync service / session log
    }
  }

  async function pushRequestSanitized(): Promise<void> {
    showSensitiveModal = false
    try {
      const wsId = appStore.activeWorkspaceId ?? undefined
      await window.api.sync.pushRequest(node.collectionId, node.id, true, wsId)
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
    { label: 'Open in Tab', action: handleClick, icon: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25' },
    { label: 'Duplicate', action: duplicate, icon: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75' },
    { label: 'Rename', action: startRename, icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z' },
    ...(syncEnabled ? [
      { label: '', action: () => {}, separator: true },
      { label: 'Push to Remote', action: pushRequest, icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5' },
      { label: 'Pull from Remote', action: pullCollection, icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3' },
    ] : []),
    { label: '', action: () => {}, separator: true },
    { label: 'Delete', action: handleDelete, danger: true, icon: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' },
  ])
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="group {dragStore.dragging?.id === node.id ? 'opacity-50' : ''}"
  data-request-id={node.id}
  oncontextmenu={handleContextMenu}
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
>
  <button
    class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left transition-all duration-150 {isActive ? 'bg-[var(--tint-active)] text-brand-300 shadow-[inset_0_1px_0_var(--glass-highlight)]' : 'hover:bg-[var(--tint-hover)]'}"
    onclick={handleClick}
  >
    <!-- Method badge -->
    <span class="w-9 shrink-0 text-right font-mono text-[10px] font-bold" style:color={getMethodColor(node.method ?? 'GET')}>
      {(node.method ?? 'GET').slice(0, 4)}
    </span>

    {#if renaming}
      <input
        bind:this={inputEl}
        bind:value={renameValue}
        onblur={commitRename}
        onkeydown={handleRenameKeydown}
        onclick={(e) => e.stopPropagation()}
        class="h-5 min-w-0 flex-1 rounded-md border border-brand-500/50 bg-[var(--tint-muted)] px-1 text-xs text-surface-100 outline-none"
      />
    {:else}
      <span class="min-w-0 flex-1 truncate text-[13px] {isActive ? 'text-brand-200' : 'text-surface-300'}">
        {node.name}
      </span>
    {/if}
  </button>
</div>

{#if contextMenu}
  <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onclose={() => contextMenu = null} />
{/if}

{#if showSensitiveModal}
  <SensitiveDataModal
    findings={sensitiveFindings}
    onclose={() => { showSensitiveModal = false }}
    onsyncanyway={pushRequestAnyway}
    onsyncwithout={pushRequestSanitized}
  />
{/if}
