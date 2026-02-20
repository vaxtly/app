/**
 * Collections store — tree data for sidebar.
 * Loads collections, folders, and requests from IPC and builds the tree.
 */

import type { Collection, Folder, Request } from '../../lib/types'

// --- Types ---

export interface TreeNode {
  type: 'collection' | 'folder' | 'request'
  id: string
  name: string
  order: number
  method?: string
  children: TreeNode[]
  expanded: boolean
  collectionId: string
  parentId: string | null
}

// --- State ---

let collections = $state<Collection[]>([])
let folders = $state<Folder[]>([])
let requests = $state<Request[]>([])
let tree = $state<TreeNode[]>([])
let expandedIds = $state<Set<string>>(new Set())

// Max folder nesting depth to prevent infinite recursion from data cycles
const MAX_FOLDER_DEPTH = 10

// --- Actions ---

async function loadAll(workspaceId?: string): Promise<void> {
  collections = await window.api.collections.list(workspaceId)

  // Load folders and requests for all collections in parallel
  const results = await Promise.all(
    collections.map((col) =>
      Promise.all([
        window.api.folders.list(col.id),
        window.api.requests.list(col.id),
      ])
    )
  )

  const allFolders: Folder[] = []
  const allRequests: Request[] = []
  for (const [f, r] of results) {
    allFolders.push(...f)
    allRequests.push(...r)
  }

  folders = allFolders
  requests = allRequests
  rebuildTree()
}

function rebuildTree(): void {
  tree = collections.map((col) => buildCollectionNode(col))
}

function buildCollectionNode(col: Collection): TreeNode {
  const colFolders = folders.filter((f) => f.collection_id === col.id && !f.parent_id)
  const colRequests = requests.filter((r) => r.collection_id === col.id && !r.folder_id)

  const children: TreeNode[] = [
    ...colFolders
      .sort((a, b) => a.order - b.order)
      .map((f) => buildFolderNode(f, col.id, 0)),
    ...colRequests
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        type: 'request' as const,
        id: r.id,
        name: r.name,
        order: r.order,
        method: r.method,
        children: [],
        expanded: false,
        collectionId: col.id,
        parentId: null,
      })),
  ]

  return {
    type: 'collection',
    id: col.id,
    name: col.name,
    order: col.order,
    children,
    expanded: expandedIds.has(col.id),
    collectionId: col.id,
    parentId: null,
  }
}

function buildFolderNode(folder: Folder, collectionId: string, depth: number): TreeNode {
  const children: TreeNode[] = []

  if (depth < MAX_FOLDER_DEPTH) {
    const subFolders = folders.filter((f) => f.parent_id === folder.id)
    const folderRequests = requests.filter((r) => r.folder_id === folder.id)

    children.push(
      ...subFolders
        .sort((a, b) => a.order - b.order)
        .map((f) => buildFolderNode(f, collectionId, depth + 1)),
      ...folderRequests
        .sort((a, b) => a.order - b.order)
        .map((r) => ({
          type: 'request' as const,
          id: r.id,
          name: r.name,
          order: r.order,
          method: r.method,
          children: [],
          expanded: false,
          collectionId,
          parentId: folder.id,
        })),
    )
  }

  return {
    type: 'folder',
    id: folder.id,
    name: folder.name,
    order: folder.order,
    children,
    expanded: expandedIds.has(folder.id),
    collectionId,
    parentId: folder.parent_id,
  }
}

/** Toggle expanded state — mutates in-place instead of full tree rebuild. */
function toggleExpanded(id: string): void {
  const newSet = new Set(expandedIds)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  expandedIds = newSet

  // Update the specific node in-place instead of rebuilding the entire tree
  const node = findNodeById(tree, id)
  if (node) {
    node.expanded = expandedIds.has(id)
  }
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children.length > 0) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return undefined
}

async function createCollection(name: string, workspaceId?: string): Promise<Collection> {
  const col = await window.api.collections.create({ name, workspace_id: workspaceId })
  await loadAll(workspaceId)
  expandedIds = new Set([...expandedIds, col.id])
  // loadAll already called rebuildTree, but expandedIds changed — update the node
  const node = findNodeById(tree, col.id)
  if (node) node.expanded = true
  return col
}

async function createFolder(collectionId: string, name: string, parentId?: string): Promise<Folder> {
  const folder = await window.api.folders.create({ collection_id: collectionId, name, parent_id: parentId })
  await reloadCollection(collectionId)
  expandedIds = new Set([...expandedIds, folder.id])
  const node = findNodeById(tree, folder.id)
  if (node) node.expanded = true
  return folder
}

async function createRequest(collectionId: string, name: string, folderId?: string): Promise<Request> {
  const req = await window.api.requests.create({ collection_id: collectionId, name, folder_id: folderId })
  await reloadCollection(collectionId)
  return req
}

async function renameCollection(id: string, name: string): Promise<void> {
  await window.api.collections.update(id, { name })
  const col = collections.find((c) => c.id === id)
  if (col) {
    collections = collections.map((c) => (c.id === id ? { ...c, name } : c))
    rebuildTree()
  }
}

async function renameFolder(id: string, name: string): Promise<void> {
  await window.api.folders.update(id, { name })
  folders = folders.map((f) => (f.id === id ? { ...f, name } : f))
  rebuildTree()
}

async function renameRequest(id: string, name: string): Promise<void> {
  await window.api.requests.update(id, { name })
  requests = requests.map((r) => (r.id === id ? { ...r, name } : r))
  rebuildTree()
  // Tab label update is handled by the caller (e.g., CollectionItem context menu)
}

async function deleteCollection(id: string): Promise<void> {
  await window.api.collections.delete(id)
  collections = collections.filter((c) => c.id !== id)
  folders = folders.filter((f) => f.collection_id !== id)
  requests = requests.filter((r) => r.collection_id !== id)
  rebuildTree()
}

async function deleteFolder(id: string): Promise<void> {
  await window.api.folders.delete(id)
  // Reload to handle cascading deletes
  const folder = folders.find((f) => f.id === id)
  if (folder) {
    await reloadCollection(folder.collection_id)
  }
}

async function deleteRequest(id: string): Promise<void> {
  await window.api.requests.delete(id)
  requests = requests.filter((r) => r.id !== id)
  rebuildTree()
}

async function reloadCollection(collectionId: string): Promise<void> {
  const [col, f, r] = await Promise.all([
    window.api.collections.get(collectionId),
    window.api.folders.list(collectionId),
    window.api.requests.list(collectionId),
  ])
  if (col) {
    collections = collections.map((c) => (c.id === collectionId ? col : c))
  }
  folders = [...folders.filter((fld) => fld.collection_id !== collectionId), ...f]
  requests = [...requests.filter((req) => req.collection_id !== collectionId), ...r]
  rebuildTree()
}

function getRequestById(id: string): Request | undefined {
  return requests.find((r) => r.id === id)
}

/** Expand all collections and folders in the tree. */
function expandAll(): void {
  const ids = new Set<string>()
  for (const col of collections) ids.add(col.id)
  for (const f of folders) ids.add(f.id)
  expandedIds = ids

  function walkExpand(nodes: TreeNode[]): void {
    for (const node of nodes) {
      if (node.type !== 'request') node.expanded = true
      if (node.children.length > 0) walkExpand(node.children)
    }
  }
  walkExpand(tree)
}

/** Collapse all collections and folders in the tree. */
function collapseAll(): void {
  expandedIds = new Set()

  function walkCollapse(nodes: TreeNode[]): void {
    for (const node of nodes) {
      node.expanded = false
      if (node.children.length > 0) walkCollapse(node.children)
    }
  }
  walkCollapse(tree)
}

/** Expand the collection and all ancestor folders so a request is visible in the sidebar. */
function revealRequest(requestId: string): void {
  const req = requests.find((r) => r.id === requestId)
  if (!req) return

  const idsToExpand: string[] = [req.collection_id]

  // Walk up the folder chain
  let folderId = req.folder_id
  while (folderId) {
    idsToExpand.push(folderId)
    const parent = folders.find((f) => f.id === folderId)
    folderId = parent?.parent_id ?? null
  }

  // Merge into expandedIds
  const newSet = new Set(expandedIds)
  let changed = false
  for (const id of idsToExpand) {
    if (!newSet.has(id)) {
      newSet.add(id)
      changed = true
    }
  }
  if (!changed) return

  expandedIds = newSet
  // Update nodes in-place
  for (const id of idsToExpand) {
    const node = findNodeById(tree, id)
    if (node) node.expanded = true
  }
}

/** Resolve the default environment for a request by walking folder chain → collection. */
function resolveDefaultEnvironment(requestId: string): string | null {
  const req = requests.find((r) => r.id === requestId)
  if (!req) return null

  // Walk up the folder chain looking for a default_environment_id
  let folderId = req.folder_id
  while (folderId) {
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) break
    if (folder.default_environment_id) return folder.default_environment_id
    folderId = folder.parent_id
  }

  // Fall back to collection
  const col = collections.find((c) => c.id === req.collection_id)
  return col?.default_environment_id ?? null
}

function getCollectionById(id: string): Collection | undefined {
  return collections.find((c) => c.id === id)
}

// --- Export ---

export const collectionsStore = {
  get tree() { return tree },
  get collections() { return collections },
  get folders() { return folders },
  get requests() { return requests },
  get expandedIds() { return expandedIds },

  loadAll,
  toggleExpanded,
  expandAll,
  collapseAll,
  createCollection,
  createFolder,
  createRequest,
  renameCollection,
  renameFolder,
  renameRequest,
  deleteCollection,
  deleteFolder,
  deleteRequest,
  reloadCollection,
  getRequestById,
  getCollectionById,
  resolveDefaultEnvironment,
  revealRequest,
}
