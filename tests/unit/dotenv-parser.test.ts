import { describe, it, expect } from 'vitest'
import { parseDotenv } from '../../src/main/services/dotenv-parser'

describe('parseDotenv', () => {
  it('parses basic KEY=VALUE pairs', () => {
    const result = parseDotenv('API_URL=https://api.example.com\nAPI_KEY=sk-abc123')
    expect(result).toEqual([
      { key: 'API_URL', value: 'https://api.example.com', enabled: true },
      { key: 'API_KEY', value: 'sk-abc123', enabled: true },
    ])
  })

  it('skips empty lines and comments', () => {
    const input = `
# This is a comment
API_URL=https://example.com

# Another comment
API_KEY=secret
`
    const result = parseDotenv(input)
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe('API_URL')
    expect(result[1].key).toBe('API_KEY')
  })

  it('handles double-quoted values', () => {
    const result = parseDotenv('MSG="hello world"')
    expect(result[0]).toEqual({ key: 'MSG', value: 'hello world', enabled: true })
  })

  it('handles single-quoted values', () => {
    const result = parseDotenv("MSG='hello world'")
    expect(result[0]).toEqual({ key: 'MSG', value: 'hello world', enabled: true })
  })

  it('processes escape sequences in double-quoted values', () => {
    const result = parseDotenv('MSG="line1\\nline2\\ttab"')
    expect(result[0].value).toBe('line1\nline2\ttab')
  })

  it('does not process escape sequences in single-quoted values', () => {
    const result = parseDotenv("MSG='line1\\nline2'")
    expect(result[0].value).toBe('line1\\nline2')
  })

  it('strips export prefix', () => {
    const result = parseDotenv('export API_KEY=secret')
    expect(result[0]).toEqual({ key: 'API_KEY', value: 'secret', enabled: true })
  })

  it('strips inline comments from unquoted values', () => {
    const result = parseDotenv('PORT=3000 # server port')
    expect(result[0]).toEqual({ key: 'PORT', value: '3000', enabled: true })
  })

  it('preserves # in quoted values', () => {
    const result = parseDotenv('COLOR="#ff0000"')
    expect(result[0].value).toBe('#ff0000')
  })

  it('handles empty values', () => {
    const result = parseDotenv('EMPTY=')
    expect(result[0]).toEqual({ key: 'EMPTY', value: '', enabled: true })
  })

  it('handles values with equals signs', () => {
    const result = parseDotenv('URL=https://api.example.com?foo=bar&baz=qux')
    expect(result[0].value).toBe('https://api.example.com?foo=bar&baz=qux')
  })

  it('handles Windows line endings', () => {
    const result = parseDotenv('A=1\r\nB=2\r\n')
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe('A')
    expect(result[1].key).toBe('B')
  })

  it('skips lines without = sign', () => {
    const result = parseDotenv('NOEQUALS\nVALID=yes')
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('VALID')
  })

  it('trims whitespace around keys', () => {
    const result = parseDotenv('  KEY  =value')
    expect(result[0].key).toBe('KEY')
  })

  it('handles a realistic .env file', () => {
    const input = `# Database
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
DATABASE_POOL_SIZE=10

# API
export API_KEY="sk-live-abc123"
API_SECRET='my secret value'
API_TIMEOUT=5000 # milliseconds

# Feature flags
ENABLE_FEATURE_X=true
DEBUG=
`
    const result = parseDotenv(input)
    expect(result).toHaveLength(7)
    expect(result[0]).toEqual({ key: 'DATABASE_URL', value: 'postgres://user:pass@localhost:5432/mydb', enabled: true })
    expect(result[1]).toEqual({ key: 'DATABASE_POOL_SIZE', value: '10', enabled: true })
    expect(result[2]).toEqual({ key: 'API_KEY', value: 'sk-live-abc123', enabled: true })
    expect(result[3]).toEqual({ key: 'API_SECRET', value: 'my secret value', enabled: true })
    expect(result[4]).toEqual({ key: 'API_TIMEOUT', value: '5000', enabled: true })
    expect(result[5]).toEqual({ key: 'ENABLE_FEATURE_X', value: 'true', enabled: true })
    expect(result[6]).toEqual({ key: 'DEBUG', value: '', enabled: true })
  })
})
