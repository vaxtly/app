/**
 * Integration tests for AwsSecretsManagerProvider against LocalStack.
 *
 * Requires LocalStack running on localhost:4566:
 *   docker run -d -p 4566:4566 localstack/localstack
 *
 * Skips automatically when LocalStack is not reachable.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Mock electron for session-log (BrowserWindow.getAllWindows)
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

import { AwsSecretsManagerProvider } from '../../src/main/vault/aws-secrets-manager-provider'

const LOCALSTACK_ENDPOINT = 'http://localhost:4566'
const TEST_REGION = 'us-east-1'
const TEST_SECRET_NAME = `vaxtly-test-${Date.now()}`

async function isLocalStackRunning(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOCALSTACK_ENDPOINT}/_localstack/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return resp.ok
  } catch {
    return false
  }
}

const localStackAvailable = await isLocalStackRunning()

describe.skipIf(!localStackAvailable)('AWS Secrets Manager — LocalStack integration', () => {
  let provider: AwsSecretsManagerProvider

  beforeAll(async () => {
    provider = await AwsSecretsManagerProvider.create({
      region: TEST_REGION,
      authMethod: 'keys',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      endpoint: LOCALSTACK_ENDPOINT,
    })
  })

  afterAll(async () => {
    // Clean up: delete the test secret if it still exists
    try {
      await provider.deleteSecrets(TEST_SECRET_NAME)
    } catch {
      // ignore — may already be deleted
    }
  })

  it('creates a new secret via putSecrets', async () => {
    await provider.putSecrets(TEST_SECRET_NAME, { DB_HOST: 'localhost', DB_PORT: '5432' })

    const result = await provider.getSecrets(TEST_SECRET_NAME)
    expect(result).toEqual({ DB_HOST: 'localhost', DB_PORT: '5432' })
  })

  it('lists the created secret', async () => {
    const names = await provider.listSecrets()
    expect(names).toContain(TEST_SECRET_NAME)
  })

  it('updates an existing secret', async () => {
    await provider.putSecrets(TEST_SECRET_NAME, { DB_HOST: '10.0.0.1', DB_PORT: '5433', DB_NAME: 'prod' })

    const result = await provider.getSecrets(TEST_SECRET_NAME)
    expect(result).toEqual({ DB_HOST: '10.0.0.1', DB_PORT: '5433', DB_NAME: 'prod' })
  })

  it('deletes the secret', async () => {
    await provider.deleteSecrets(TEST_SECRET_NAME)

    const result = await provider.getSecrets(TEST_SECRET_NAME)
    expect(result).toBeNull()
  })

  it('testConnection succeeds against LocalStack', async () => {
    const ok = await provider.testConnection()
    expect(ok).toBe(true)
  })
})
