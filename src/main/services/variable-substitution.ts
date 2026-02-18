/**
 * Variable substitution service.
 * Resolves {{varName}} placeholders using active environment + collection variables.
 * Collection variables override environment variables.
 * Supports nested references up to DEFAULTS.maxVarResolutionDepth levels.
 */

import * as environmentsRepo from '../database/repositories/environments'
import * as collectionsRepo from '../database/repositories/collections'
import { DEFAULTS } from '../../shared/constants'
import type { EnvironmentVariable } from '../../shared/types/models'

const VAR_PATTERN = /\{\{([\w\-.]+)\}\}/g

export interface ResolvedVariable {
  value: string
  source: string // e.g. "Env: Production" or "Collection"
}

/**
 * Get enabled variables as a flat key→value map from a JSON variables string.
 */
function parseEnabledVariables(variablesJson: string | null): Record<string, string> {
  if (!variablesJson) return {}
  try {
    const vars: EnvironmentVariable[] = JSON.parse(variablesJson)
    const result: Record<string, string> = {}
    for (const v of vars) {
      if (v.enabled && v.key.trim()) {
        result[v.key] = v.value
      }
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Get collection-level variables as a flat key→value map.
 * Collection.variables is a JSON Record<string,string> (not EnvironmentVariable[]).
 */
function parseCollectionVariables(variablesJson: string | null): Record<string, string> {
  if (!variablesJson) return {}
  try {
    const vars = JSON.parse(variablesJson)
    if (Array.isArray(vars)) {
      // Handle case where collection vars are stored as EnvironmentVariable[]
      return parseEnabledVariables(variablesJson)
    }
    // Plain object: Record<string, string>
    return vars as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Get resolved variables merging active environment with collection-level overrides.
 * Collection variables take precedence.
 */
export function getResolvedVariables(workspaceId?: string, collectionId?: string): Record<string, string> {
  const variables: Record<string, string> = {}

  // 1. Active environment variables (base layer)
  const activeEnv = environmentsRepo.findActive(workspaceId)
  if (activeEnv) {
    Object.assign(variables, parseEnabledVariables(activeEnv.variables))
  }

  // 2. Collection variables (override layer)
  if (collectionId) {
    const collection = collectionsRepo.findById(collectionId)
    if (collection?.variables) {
      Object.assign(variables, parseCollectionVariables(collection.variables))
    }
  }

  return variables
}

/**
 * Get resolved variables with their values AND source labels.
 * Nested references are resolved so tooltip shows final values.
 */
export function getResolvedVariablesWithSource(
  workspaceId?: string,
  collectionId?: string,
): Record<string, ResolvedVariable> {
  const variables: Record<string, ResolvedVariable> = {}

  // 1. Active environment variables
  const activeEnv = environmentsRepo.findActive(workspaceId)
  if (activeEnv) {
    const envLabel = `Env: ${activeEnv.name}`
    const envVars = parseEnabledVariables(activeEnv.variables)
    for (const [key, value] of Object.entries(envVars)) {
      variables[key] = { value, source: envLabel }
    }
  }

  // 2. Collection variables (override)
  if (collectionId) {
    const collection = collectionsRepo.findById(collectionId)
    if (collection?.variables) {
      const colVars = parseCollectionVariables(collection.variables)
      for (const [key, value] of Object.entries(colVars)) {
        variables[key] = { value, source: 'Collection' }
      }
    }
  }

  // 3. Resolve nested references so tooltips show final values
  const flatMap: Record<string, string> = {}
  for (const [key, entry] of Object.entries(variables)) {
    flatMap[key] = entry.value
  }

  for (const key of Object.keys(variables)) {
    variables[key].value = resolveNested(variables[key].value, flatMap)
  }

  return variables
}

/**
 * Substitute all {{varName}} in a text string.
 */
export function substitute(
  text: string,
  workspaceId?: string,
  collectionId?: string,
): string {
  if (!text) return text

  const variables = getResolvedVariables(workspaceId, collectionId)
  return resolveNested(text, variables)
}

/**
 * Substitute variables in a key→value record (both keys and values).
 */
export function substituteRecord(
  items: Record<string, string>,
  workspaceId?: string,
  collectionId?: string,
): Record<string, string> {
  const variables = getResolvedVariables(workspaceId, collectionId)
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(items)) {
    const resolvedKey = resolveNested(key, variables)
    const resolvedValue = resolveNested(value, variables)
    result[resolvedKey] = resolvedValue
  }

  return result
}

/**
 * Resolve nested variable references in a string up to maxDepth iterations.
 */
function resolveNested(text: string, variables: Record<string, string>): string {
  const maxDepth = DEFAULTS.MAX_VARIABLE_NESTING

  for (let i = 0; i < maxDepth; i++) {
    const result = text.replace(VAR_PATTERN, (match, varName: string) => {
      return variables[varName] ?? match
    })

    if (result === text) break
    text = result
  }

  return text
}
