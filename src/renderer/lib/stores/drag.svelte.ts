/**
 * Drag-and-drop state for sidebar items.
 */

export type DragItemType = 'request' | 'folder'

export interface DragItem {
  type: DragItemType
  id: string
  collectionId: string
  parentId: string | null
}

let dragging = $state<DragItem | null>(null)
let dropTargetId = $state<string | null>(null)

function startDrag(item: DragItem): void {
  dragging = item
}

function endDrag(): void {
  dragging = null
  dropTargetId = null
}

function setDropTarget(id: string | null): void {
  dropTargetId = id
}

export const dragStore = {
  get dragging() { return dragging },
  get dropTargetId() { return dropTargetId },

  startDrag,
  endDrag,
  setDropTarget,
}
