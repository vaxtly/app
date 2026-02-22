import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron for session-log
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

// Hoist mocks so vi.mock factories can reference them
const { mockSend, MockResourceNotFoundException, mockFromIni } = vi.hoisted(() => {
  const mockSend = vi.fn()
  class MockResourceNotFoundException extends Error {
    name = 'ResourceNotFoundException'
  }
  const mockFromIni = vi.fn()
  return { mockSend, MockResourceNotFoundException, mockFromIni }
})

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class { send = mockSend },
  ListSecretsCommand: class { _type = 'ListSecrets'; input: unknown; constructor(input: unknown) { this.input = input } },
  GetSecretValueCommand: class { _type = 'GetSecretValue'; input: unknown; constructor(input: unknown) { this.input = input } },
  PutSecretValueCommand: class { _type = 'PutSecretValue'; input: unknown; constructor(input: unknown) { this.input = input } },
  CreateSecretCommand: class { _type = 'CreateSecret'; input: unknown; constructor(input: unknown) { this.input = input } },
  DeleteSecretCommand: class { _type = 'DeleteSecret'; input: unknown; constructor(input: unknown) { this.input = input } },
  ResourceNotFoundException: MockResourceNotFoundException,
}))

vi.mock('@aws-sdk/credential-providers', () => ({
  fromIni: mockFromIni,
}))

import { AwsSecretsManagerProvider } from '../../src/main/vault/aws-secrets-manager-provider'

beforeEach(() => {
  mockSend.mockReset()
  mockFromIni.mockReset()
})

describe('testConnection', () => {
  it('returns true on success', async () => {
    mockSend.mockResolvedValueOnce({ SecretList: [] })

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    const result = await provider.testConnection()
    expect(result).toBe(true)
  })

  it('returns false on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Access Denied'))

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    const result = await provider.testConnection()
    expect(result).toBe(false)
  })
})

describe('getSecrets', () => {
  it('returns parsed JSON', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ DB_HOST: 'localhost', DB_PORT: '5432' }),
    })

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    const result = await provider.getSecrets('myapp/dev')
    expect(result).toEqual({ DB_HOST: 'localhost', DB_PORT: '5432' })
  })

  it('returns null on ResourceNotFoundException', async () => {
    mockSend.mockRejectedValueOnce(new MockResourceNotFoundException('Not found'))

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    const result = await provider.getSecrets('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null when SecretString is empty', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: undefined })

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    const result = await provider.getSecrets('binary-secret')
    expect(result).toBeNull()
  })
})

describe('putSecrets', () => {
  it('uses PutSecretValue for existing secret', async () => {
    mockSend.mockResolvedValueOnce({})

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    await provider.putSecrets('myapp/dev', { KEY: 'value' })

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[0][0]._type).toBe('PutSecretValue')
  })

  it('falls back to CreateSecret on ResourceNotFoundException', async () => {
    mockSend
      .mockRejectedValueOnce(new MockResourceNotFoundException('Not found'))
      .mockResolvedValueOnce({})

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    await provider.putSecrets('new-secret', { KEY: 'value' })

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend.mock.calls[0][0]._type).toBe('PutSecretValue')
    expect(mockSend.mock.calls[1][0]._type).toBe('CreateSecret')
  })
})

describe('deleteSecrets', () => {
  it('deletes with ForceDeleteWithoutRecovery', async () => {
    mockSend.mockResolvedValueOnce({})

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    await provider.deleteSecrets('myapp/dev')

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[0][0]._type).toBe('DeleteSecret')
  })

  it('ignores ResourceNotFoundException', async () => {
    mockSend.mockRejectedValueOnce(new MockResourceNotFoundException('Not found'))

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    // Should not throw
    await provider.deleteSecrets('nonexistent')
  })
})

describe('listSecrets', () => {
  it('returns secret names', async () => {
    mockSend.mockResolvedValueOnce({
      SecretList: [{ Name: 'secret-1' }, { Name: 'secret-2' }],
      NextToken: undefined,
    })

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    const result = await provider.listSecrets()
    expect(result).toEqual(['secret-1', 'secret-2'])
  })

  it('handles pagination', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretList: [{ Name: 'page-1' }],
        NextToken: 'token-2',
      })
      .mockResolvedValueOnce({
        SecretList: [{ Name: 'page-2' }],
        NextToken: undefined,
      })

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    const result = await provider.listSecrets()
    expect(result).toEqual(['page-1', 'page-2'])
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('filters by basePath prefix', async () => {
    mockSend.mockResolvedValueOnce({
      SecretList: [{ Name: 'prod/db' }],
      NextToken: undefined,
    })

    const provider = await AwsSecretsManagerProvider.create({ region: 'us-east-1' })
    await provider.listSecrets('prod')

    // Verify filter was passed
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input.Filters).toEqual([{ Key: 'name', Values: ['prod'] }])
  })
})

describe('create() credential variants', () => {
  it('uses explicit credentials when provided', async () => {
    const provider = await AwsSecretsManagerProvider.create({
      region: 'us-east-1',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'secret123',
    })
    expect(provider).toBeInstanceOf(AwsSecretsManagerProvider)
    expect(mockFromIni).not.toHaveBeenCalled()
  })

  it('uses fromIni when profile is provided', async () => {
    mockFromIni.mockReturnValue(() =>
      Promise.resolve({ accessKeyId: 'PROFILE_KEY', secretAccessKey: 'PROFILE_SECRET' }),
    )

    const provider = await AwsSecretsManagerProvider.create({
      region: 'us-west-2',
      profile: 'my-profile',
    })
    expect(provider).toBeInstanceOf(AwsSecretsManagerProvider)
    expect(mockFromIni).toHaveBeenCalledWith({ profile: 'my-profile' })
  })

  it('uses default credential chain when nothing provided', async () => {
    const provider = await AwsSecretsManagerProvider.create({
      region: 'eu-west-1',
    })
    expect(provider).toBeInstanceOf(AwsSecretsManagerProvider)
    expect(mockFromIni).not.toHaveBeenCalled()
  })
})
