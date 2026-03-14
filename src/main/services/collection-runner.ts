/**
 * Collection Runner — executes all requests in a collection sequentially.
 * Results are streamed to the renderer via push events.
 */

import { v4 as uuid } from 'uuid'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as requestsRepo from '../database/repositories/requests'
import { executePreRequestScripts, executePostResponseScripts, executeHttpRequest } from './script-execution'
import { evaluateAssertions } from './assertion-evaluator'
import type { Request, Folder, ScriptsConfig, Assertion } from '../../shared/types/models'
import type { RequestRunResult, CollectionRunResult, RunnerStartedEvent, RunnerProgressEvent } from '../../shared/types/runner'

// Active runs with abort controllers
const activeRuns = new Map<string, AbortController>()

export interface RunCallbacks {
  onStarted: (event: RunnerStartedEvent) => void
  onProgress: (event: RunnerProgressEvent) => void
  onComplete: (result: CollectionRunResult) => void
}

/**
 * Run all requests in a collection. Walks the tree in order (matching sidebar rendering).
 * Skips WebSocket-type requests. Streams progress via callbacks.
 */
export async function startRun(
  collectionId: string,
  workspaceId: string | undefined,
  callbacks: RunCallbacks,
): Promise<CollectionRunResult> {
  const collection = collectionsRepo.findById(collectionId)
  if (!collection) throw new Error(`Collection [${collectionId}] not found`)

  const runId = uuid()
  const controller = new AbortController()
  activeRuns.set(runId, controller)

  // Walk the tree and collect requests in order
  const orderedRequests = getOrderedRequests(collectionId)

  // Emit started event
  callbacks.onStarted({
    runId,
    collectionId,
    total: orderedRequests.length,
    requestNames: orderedRequests.map((r) => r.name),
  })

  const results: RequestRunResult[] = []
  let passed = 0
  let failed = 0
  let skipped = 0
  const runStart = performance.now()

  for (let i = 0; i < orderedRequests.length; i++) {
    // Check cancellation between requests
    if (controller.signal.aborted) {
      skipped = orderedRequests.length - i
      break
    }

    const request = orderedRequests[i]
    const result = await executeRequest(request, collectionId, workspaceId)
    results.push(result)

    if (result.passed) {
      passed++
    } else {
      failed++
    }

    callbacks.onProgress({
      runId,
      index: i,
      total: orderedRequests.length,
      result,
    })
  }

  const totalTiming = performance.now() - runStart

  const runResult: CollectionRunResult = {
    runId,
    collectionId,
    collectionName: collection.name,
    total: orderedRequests.length,
    passed,
    failed,
    skipped,
    timing: totalTiming,
    results,
  }

  activeRuns.delete(runId)
  callbacks.onComplete(runResult)

  return runResult
}

/**
 * Cancel a running collection run.
 */
export function cancelRun(runId: string): void {
  const controller = activeRuns.get(runId)
  if (controller) {
    controller.abort()
    activeRuns.delete(runId)
  }
}

/**
 * Walk the collection tree and return requests in sidebar order.
 * Order: root requests first (by order), then folders (by order) with their requests recursively.
 */
function getOrderedRequests(collectionId: string): Request[] {
  const allFolders = foldersRepo.findByCollection(collectionId)
  const allRequests = requestsRepo.findByCollection(collectionId)

  // Build folder tree
  const foldersByParent = new Map<string | null, Folder[]>()
  for (const folder of allFolders) {
    const parentKey = folder.parent_id
    if (!foldersByParent.has(parentKey)) {
      foldersByParent.set(parentKey, [])
    }
    foldersByParent.get(parentKey)!.push(folder)
  }
  // Sort folders by order
  for (const folders of foldersByParent.values()) {
    folders.sort((a, b) => a.order - b.order)
  }

  // Group requests by folder
  const requestsByFolder = new Map<string | null, Request[]>()
  for (const req of allRequests) {
    const folderKey = req.folder_id
    if (!requestsByFolder.has(folderKey)) {
      requestsByFolder.set(folderKey, [])
    }
    requestsByFolder.get(folderKey)!.push(req)
  }
  // Sort requests by order
  for (const reqs of requestsByFolder.values()) {
    reqs.sort((a, b) => a.order - b.order)
  }

  const result: Request[] = []

  function walkFolder(parentId: string | null): void {
    // Add requests at this level
    const requests = requestsByFolder.get(parentId) ?? []
    for (const req of requests) {
      // Skip WebSocket requests (method === 'WEBSOCKET')
      if (req.method === 'WEBSOCKET') continue
      result.push(req)
    }

    // Recurse into child folders
    const children = foldersByParent.get(parentId) ?? []
    for (const folder of children) {
      walkFolder(folder.id)
    }
  }

  walkFolder(null)
  return result
}

/**
 * Execute a single request with pre/post scripts and assertions.
 */
async function executeRequest(
  request: Request,
  collectionId: string,
  workspaceId: string | undefined,
): Promise<RequestRunResult> {
  const startTime = performance.now()

  try {
    // Pre-request scripts
    await executePreRequestScripts(request.id, collectionId, workspaceId)

    // Execute the HTTP request
    const response = await executeHttpRequest(request.id, collectionId, workspaceId)

    // Post-response scripts
    executePostResponseScripts(request.id, collectionId, response, workspaceId)

    // Evaluate assertions
    let assertions: Assertion[] = []
    if (request.scripts) {
      try {
        const scripts: ScriptsConfig = JSON.parse(request.scripts)
        assertions = scripts.assertions ?? []
      } catch { /* ignore */ }
    }

    const assertionResults = assertions.length > 0
      ? evaluateAssertions(assertions.filter(a => a.enabled), response)
      : []

    const allAssertionsPassed = assertionResults.every((r) => r.passed)
    const passed = response.status !== 0 && allAssertionsPassed

    return {
      requestId: request.id,
      requestName: request.name,
      method: request.method,
      url: request.url,
      status: response.status,
      statusText: response.statusText,
      timing: performance.now() - startTime,
      size: response.size,
      passed,
      assertionResults,
    }
  } catch (error) {
    return {
      requestId: request.id,
      requestName: request.name,
      method: request.method,
      url: request.url,
      status: 0,
      statusText: 'Error',
      timing: performance.now() - startTime,
      size: 0,
      passed: false,
      assertionResults: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
