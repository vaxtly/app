/**
 * GraphQL schema cache store — caches introspection results per URL.
 */

import { buildClientSchema, type GraphQLSchema, type IntrospectionQuery } from 'graphql'

interface SchemaEntry {
  schema: GraphQLSchema | null
  loading: boolean
  error: string | null
}

const MAX_CACHE_SIZE = 20

let cache = $state<Record<string, SchemaEntry>>({})
let cacheOrder: string[] = [] // LRU: most-recently-used at the end

function touchUrl(url: string): void {
  cacheOrder = cacheOrder.filter((u) => u !== url)
  cacheOrder.push(url)
}

function evictIfNeeded(): void {
  while (cacheOrder.length > MAX_CACHE_SIZE) {
    const oldest = cacheOrder.shift()!
    const next = { ...cache }
    delete next[oldest]
    cache = next
  }
}

export const graphqlStore = {
  getSchema(url: string): SchemaEntry | undefined {
    return cache[url]
  },

  async fetchSchema(
    url: string,
    headers: Record<string, string>,
    workspaceId?: string,
    collectionId?: string,
  ): Promise<void> {
    touchUrl(url)
    evictIfNeeded()
    cache = { ...cache, [url]: { schema: cache[url]?.schema ?? null, loading: true, error: null } }
    try {
      const introspectionData = await window.api.graphql.introspect({
        url,
        headers,
        workspaceId,
        collectionId,
      })
      const schema = buildClientSchema(introspectionData as IntrospectionQuery)
      cache = { ...cache, [url]: { schema, loading: false, error: null } }
    } catch (e) {
      cache = {
        ...cache,
        [url]: { schema: null, loading: false, error: e instanceof Error ? e.message : String(e) },
      }
    }
  },

  clearSchema(url: string): void {
    cacheOrder = cacheOrder.filter((u) => u !== url)
    const next = { ...cache }
    delete next[url]
    cache = next
  },
}
