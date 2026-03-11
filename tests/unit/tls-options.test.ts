import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Agent, ProxyAgent } from 'undici'
import https from 'node:https'

// Mock dependencies
vi.mock('../../src/main/database/repositories/settings', () => ({
  getSetting: vi.fn(),
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

import * as settingsRepo from '../../src/main/database/repositories/settings'
import { readFileSync, existsSync } from 'fs'
import {
  getTlsConfig,
  createUndiciDispatcher,
  createHttpsAgent,
  getProxyConfig,
  shouldProxy,
} from '../../src/main/services/tls-options'

const mockGetSetting = settingsRepo.getSetting as ReturnType<typeof vi.fn>
const mockReadFile = readFileSync as ReturnType<typeof vi.fn>
const mockExists = existsSync as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSetting.mockReturnValue(undefined)
  mockExists.mockReturnValue(true)
  mockReadFile.mockReturnValue(Buffer.from('CERT_DATA'))
})

describe('getTlsConfig', () => {
  it('returns only rejectUnauthorized when no certs configured', () => {
    const config = getTlsConfig(true)
    expect(config).toEqual({ rejectUnauthorized: true })
  })

  it('returns rejectUnauthorized false when verifySsl is false', () => {
    const config = getTlsConfig(false)
    expect(config).toEqual({ rejectUnauthorized: false })
  })

  it('loads CA cert when verifySsl is true and path is set', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.ca_cert_path' ? '/path/to/ca.pem' : undefined,
    )
    const config = getTlsConfig(true)
    expect(config.ca).toEqual(Buffer.from('CERT_DATA'))
    expect(config.rejectUnauthorized).toBe(true)
    expect(mockReadFile).toHaveBeenCalledWith('/path/to/ca.pem')
  })

  it('skips CA cert when verifySsl is false', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.ca_cert_path' ? '/path/to/ca.pem' : undefined,
    )
    const config = getTlsConfig(false)
    expect(config.ca).toBeUndefined()
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('loads client cert and key', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'tls.client_cert_path') return '/path/to/cert.pem'
      if (key === 'tls.client_key_path') return '/path/to/key.pem'
      return undefined
    })
    const config = getTlsConfig(true)
    expect(config.cert).toEqual(Buffer.from('CERT_DATA'))
    expect(config.key).toEqual(Buffer.from('CERT_DATA'))
  })

  it('loads client cert and key even when verifySsl is false', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'tls.client_cert_path') return '/path/to/cert.pem'
      if (key === 'tls.client_key_path') return '/path/to/key.pem'
      return undefined
    })
    const config = getTlsConfig(false)
    expect(config.cert).toEqual(Buffer.from('CERT_DATA'))
    expect(config.key).toEqual(Buffer.from('CERT_DATA'))
    expect(config.rejectUnauthorized).toBe(false)
  })

  it('includes passphrase when set', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'tls.client_key_path') return '/path/to/key.pem'
      if (key === 'tls.client_key_passphrase') return 'secret123'
      return undefined
    })
    const config = getTlsConfig(true)
    expect(config.passphrase).toBe('secret123')
  })

  it('throws when CA cert file does not exist', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.ca_cert_path' ? '/missing/ca.pem' : undefined,
    )
    mockExists.mockReturnValue(false)
    expect(() => getTlsConfig(true)).toThrow('CA certificate file not found: /missing/ca.pem')
  })

  it('throws when client cert file does not exist', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.client_cert_path' ? '/missing/cert.pem' : undefined,
    )
    mockExists.mockReturnValue(false)
    expect(() => getTlsConfig(true)).toThrow('Client certificate file not found: /missing/cert.pem')
  })

  it('throws when client key file does not exist', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.client_key_path' ? '/missing/key.pem' : undefined,
    )
    mockExists.mockReturnValue(false)
    expect(() => getTlsConfig(true)).toThrow('Client key file not found: /missing/key.pem')
  })
})

describe('getProxyConfig', () => {
  it('returns null when no proxy.url is set', () => {
    expect(getProxyConfig()).toBeNull()
  })

  it('returns config with url when proxy.url is set', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'proxy.url' ? 'http://proxy:8080' : undefined,
    )
    const config = getProxyConfig()
    expect(config).toEqual({
      url: 'http://proxy:8080',
      noProxy: [],
    })
  })

  it('includes Basic auth token when username is set', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'proxy.url') return 'http://proxy:8080'
      if (key === 'proxy.username') return 'admin'
      if (key === 'proxy.password') return 's3cret'
      return undefined
    })
    const config = getProxyConfig()!
    expect(config.token).toBe(`Basic ${Buffer.from('admin:s3cret').toString('base64')}`)
  })

  it('handles username with empty password', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'proxy.url') return 'http://proxy:8080'
      if (key === 'proxy.username') return 'admin'
      return undefined
    })
    const config = getProxyConfig()!
    expect(config.token).toBe(`Basic ${Buffer.from('admin:').toString('base64')}`)
  })

  it('parses no_proxy list', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'proxy.url') return 'http://proxy:8080'
      if (key === 'proxy.no_proxy') return 'localhost, *.local, .corp.com'
      return undefined
    })
    const config = getProxyConfig()!
    expect(config.noProxy).toEqual(['localhost', '*.local', '.corp.com'])
  })
})

describe('shouldProxy', () => {
  it('returns true when no_proxy list is empty', () => {
    expect(shouldProxy('https://api.example.com', [])).toBe(true)
  })

  it('returns false for exact hostname match', () => {
    expect(shouldProxy('http://localhost:3000/api', ['localhost'])).toBe(false)
  })

  it('returns false for wildcard prefix match', () => {
    expect(shouldProxy('https://foo.local/path', ['*.local'])).toBe(false)
  })

  it('returns false for leading dot suffix match', () => {
    expect(shouldProxy('https://api.corp.com/v1', ['.corp.com'])).toBe(false)
  })

  it('returns true when hostname does not match any pattern', () => {
    expect(shouldProxy('https://external.com', ['localhost', '*.local'])).toBe(true)
  })

  it('returns false for wildcard * (match all)', () => {
    expect(shouldProxy('https://anything.com', ['*'])).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(shouldProxy('https://API.CORP.COM/v1', ['.corp.com'])).toBe(false)
  })

  it('returns true for invalid URL (safe fallback)', () => {
    expect(shouldProxy('not-a-url', ['localhost'])).toBe(true)
  })
})

describe('createUndiciDispatcher', () => {
  it('returns undefined when no custom TLS config needed', () => {
    expect(createUndiciDispatcher(true)).toBeUndefined()
  })

  it('returns Agent when verifySsl is false', () => {
    const dispatcher = createUndiciDispatcher(false)
    expect(dispatcher).toBeInstanceOf(Agent)
  })

  it('returns Agent when CA cert is configured', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.ca_cert_path' ? '/path/to/ca.pem' : undefined,
    )
    const dispatcher = createUndiciDispatcher(true)
    expect(dispatcher).toBeInstanceOf(Agent)
  })

  it('returns Agent when client cert is configured', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.client_cert_path' ? '/path/to/cert.pem' : undefined,
    )
    const dispatcher = createUndiciDispatcher(true)
    expect(dispatcher).toBeInstanceOf(Agent)
  })

  it('returns ProxyAgent when proxy is configured', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'proxy.url' ? 'http://proxy:8080' : undefined,
    )
    const dispatcher = createUndiciDispatcher(true, 'https://api.example.com')
    expect(dispatcher).toBeInstanceOf(ProxyAgent)
  })

  it('returns ProxyAgent when proxy is configured (no targetUrl)', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'proxy.url' ? 'http://proxy:8080' : undefined,
    )
    const dispatcher = createUndiciDispatcher(true)
    expect(dispatcher).toBeInstanceOf(ProxyAgent)
  })

  it('returns Agent (not ProxyAgent) when target is in no_proxy list', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'proxy.url') return 'http://proxy:8080'
      if (key === 'proxy.no_proxy') return 'localhost'
      return undefined
    })
    // Target matches no_proxy → bypass proxy, but verifySsl=false → still needs Agent
    const dispatcher = createUndiciDispatcher(false, 'http://localhost:3000')
    expect(dispatcher).toBeInstanceOf(Agent)
    expect(dispatcher).not.toBeInstanceOf(ProxyAgent)
  })

  it('returns undefined when target is in no_proxy list and no custom TLS', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'proxy.url') return 'http://proxy:8080'
      if (key === 'proxy.no_proxy') return 'localhost'
      return undefined
    })
    const dispatcher = createUndiciDispatcher(true, 'http://localhost:3000')
    expect(dispatcher).toBeUndefined()
  })

  it('returns ProxyAgent with TLS config when both proxy and certs are set', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'proxy.url') return 'http://proxy:8080'
      if (key === 'tls.ca_cert_path') return '/path/to/ca.pem'
      return undefined
    })
    const dispatcher = createUndiciDispatcher(true, 'https://api.example.com')
    expect(dispatcher).toBeInstanceOf(ProxyAgent)
  })
})

describe('createHttpsAgent', () => {
  it('returns undefined when no custom TLS config needed', () => {
    expect(createHttpsAgent(true)).toBeUndefined()
  })

  it('returns https.Agent when verifySsl is false', () => {
    const agent = createHttpsAgent(false)
    expect(agent).toBeInstanceOf(https.Agent)
  })

  it('returns https.Agent when CA cert is configured', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.ca_cert_path' ? '/path/to/ca.pem' : undefined,
    )
    const agent = createHttpsAgent(true)
    expect(agent).toBeInstanceOf(https.Agent)
  })

  it('returns https.Agent when client cert is configured', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'tls.client_cert_path' ? '/path/to/cert.pem' : undefined,
    )
    const agent = createHttpsAgent(true)
    expect(agent).toBeInstanceOf(https.Agent)
  })
})
