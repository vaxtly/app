<script lang="ts">
  import { collectionsStore, type TreeNode } from '../../lib/stores/collections.svelte'
  import { appStore } from '../../lib/stores/app.svelte'
  import { dragStore } from '../../lib/stores/drag.svelte'
  import { METHOD_COLORS } from '../../lib/utils/http-colors'
  import ContextMenu from '../shared/ContextMenu.svelte'

  interface Props {
    node: TreeNode
    onrequestclick: (requestId: string) => void
  }

  let { node, onrequestclick }: Props = $props()

  let renaming = $state(false)
  let renameValue = $state('')
  let contextMenu = $state<{ x: number; y: number } | null>(null)
  let inputEl = $state<HTMLInputElement | null>(null)

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

  let contextMenuItems = $derived([
    { label: 'Open in Tab', action: handleClick },
    { label: 'Duplicate', action: duplicate },
    { label: 'Rename', action: startRename },
    { label: '', action: () => {}, separator: true },
    { label: 'Delete', action: handleDelete, danger: true },
  ])
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="group {dragStore.dragging?.id === node.id ? 'opacity-50' : ''}"
  oncontextmenu={handleContextMenu}
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
>
  <button
    class="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left {isActive ? 'bg-brand-500/10 text-brand-300' : 'hover:bg-surface-800'}"
    onclick={handleClick}
  >
    <!-- Method badge -->
    <span class="w-8 shrink-0 text-right font-mono text-[9px] font-bold {METHOD_COLORS[node.method ?? 'GET'] ?? 'text-surface-400'}">
      {(node.method ?? 'GET').slice(0, 4)}
    </span>

    {#if renaming}
      <input
        bind:this={inputEl}
        bind:value={renameValue}
        onblur={commitRename}
        onkeydown={handleRenameKeydown}
        onclick={(e) => e.stopPropagation()}
        class="h-5 min-w-0 flex-1 rounded border border-brand-500 bg-surface-800 px-1 text-xs text-surface-100 outline-none"
      />
    {:else}
      <span class="min-w-0 flex-1 truncate text-xs {isActive ? 'text-brand-200' : 'text-surface-300'}">
        {node.name}
      </span>
    {/if}
  </button>
</div>

{#if contextMenu}
  <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onclose={() => contextMenu = null} />
{/if}
