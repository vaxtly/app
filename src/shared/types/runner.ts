/** Collection Runner types */

import type { AssertionResult } from './models'

export interface RequestRunResult {
  requestId: string
  requestName: string
  method: string
  url: string
  status: number
  statusText: string
  timing: number
  size: number
  passed: boolean
  assertionResults: AssertionResult[]
  error?: string
}

export interface CollectionRunResult {
  runId: string
  collectionId: string
  collectionName: string
  total: number
  passed: number
  failed: number
  skipped: number
  timing: number
  results: RequestRunResult[]
}

/** Push event: run started */
export interface RunnerStartedEvent {
  runId: string
  collectionId: string
  total: number
  requestNames: string[]
}

/** Push event: individual request completed */
export interface RunnerProgressEvent {
  runId: string
  index: number
  total: number
  result: RequestRunResult
}
