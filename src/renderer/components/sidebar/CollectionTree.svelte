<script lang="ts">
  import { collectionsStore, type TreeNode } from '../../lib/stores/collections.svelte'
  import CollectionItem from './CollectionItem.svelte'
  import FolderItem from './FolderItem.svelte'
  import RequestItem from './RequestItem.svelte'

  interface Props {
    searchFilter: string
    onrequestclick: (requestId: string) => void
  }

  let { searchFilter, onrequestclick }: Props = $props()

  let filteredTree = $derived.by(() => {
    if (!searchFilter.trim()) return collectionsStore.tree
    const q = searchFilter.toLowerCase()
    return collectionsStore.tree
      .map((node) => filterNode(node, q))
      .filter((n): n is TreeNode => n !== null)
  })

  function filterNode(node: TreeNode, query: string): TreeNode | null {
    if (node.type === 'request') {
      if (node.name.toLowerCase().includes(query) || (node.method?.toLowerCase().includes(query))) {
        return node
      }
      return null
    }

    const matchesSelf = node.name.toLowerCase().includes(query)
    const filteredChildren = node.children
      .map((child) => filterNode(child, query))
      .filter((n): n is TreeNode => n !== null)

    if (matchesSelf || filteredChildren.length > 0) {
      return { ...node, children: matchesSelf ? node.children : filteredChildren, expanded: true }
    }
    return null
  }
</script>

<div class="space-y-0.5">
  {#each filteredTree as node (node.id)}
    {#if node.type === 'collection'}
      <CollectionItem {node} {onrequestclick} />
    {/if}
  {/each}
</div>
