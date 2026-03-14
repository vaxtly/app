/**
 * Assertion evaluator — pure function that evaluates assertions against a response.
 * Used by proxy handler after post-response scripts and by the collection runner.
 */

import type { Assertion, AssertionResult, ScriptsConfig } from '../../shared/types/models'
import type { ResponseData } from '../../shared/types/http'
import { extractJsonPath } from './script-execution'
import * as requestsRepo from '../database/repositories/requests'

/**
 * Evaluate all assertions for a request against a response.
 * Returns an empty array if the request has no assertions.
 */
export function evaluateRequestAssertions(
  requestId: string,
  response: ResponseData,
): AssertionResult[] {
  const request = requestsRepo.findById(requestId)
  if (!request?.scripts) return []

  let scripts: ScriptsConfig
  try {
    scripts = JSON.parse(request.scripts)
  } catch {
    return []
  }

  if (!scripts.assertions || scripts.assertions.length === 0) return []

  return evaluateAssertions(scripts.assertions, response)
}

/**
 * Evaluate a list of assertions against a response. Pure function.
 */
export function evaluateAssertions(
  assertions: Assertion[],
  response: ResponseData,
): AssertionResult[] {
  return assertions
    .filter((a) => a.enabled)
    .map((assertion) => evaluateOne(assertion, response))
}

function evaluateOne(assertion: Assertion, response: ResponseData): AssertionResult {
  try {
    const actual = getActualValue(assertion, response)

    // exists / not_exists don't need comparison
    if (assertion.operator === 'exists') {
      return { assertion, passed: actual !== null, actual }
    }
    if (assertion.operator === 'not_exists') {
      return { assertion, passed: actual === null, actual }
    }

    if (actual === null) {
      return { assertion, passed: false, actual: null, error: 'Value not found' }
    }

    const passed = compare(actual, assertion.operator, assertion.expected)
    return { assertion, passed, actual }
  } catch (e) {
    return {
      assertion,
      passed: false,
      actual: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function getActualValue(assertion: Assertion, response: ResponseData): string | null {
  switch (assertion.type) {
    case 'status':
      return String(response.status)

    case 'header': {
      const target = assertion.target.toLowerCase()
      for (const [key, value] of Object.entries(response.headers)) {
        if (key.toLowerCase() === target) return value
      }
      return null
    }

    case 'json_path': {
      try {
        const parsed = JSON.parse(response.body)
        if (typeof parsed !== 'object' || parsed === null) return null
        return extractJsonPath(parsed, assertion.target)
      } catch {
        return null
      }
    }

    case 'response_time':
      return String(Math.round(response.timing.total))

    default:
      return null
  }
}

function compare(actual: string, operator: AssertionOperator, expected: string): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected

    case 'not_equals':
      return actual !== expected

    case 'contains':
      return actual.includes(expected)

    case 'not_contains':
      return !actual.includes(expected)

    case 'less_than': {
      const a = parseFloat(actual)
      const b = parseFloat(expected)
      if (isNaN(a) || isNaN(b)) return false
      return a < b
    }

    case 'greater_than': {
      const a = parseFloat(actual)
      const b = parseFloat(expected)
      if (isNaN(a) || isNaN(b)) return false
      return a > b
    }

    case 'matches_regex': {
      try {
        // Limit regex complexity to prevent ReDoS
        if (expected.length > 500) return false
        const re = new RegExp(expected)
        return re.test(actual)
      } catch {
        return false
      }
    }

    default:
      return false
  }
}

type AssertionOperator = Assertion['operator']
