import { isCurlCommand, parseCurl } from '../../src/shared/curl-parser'

describe('isCurlCommand', () => {
  it('detects curl commands', () => {
    expect(isCurlCommand('curl https://api.example.com')).toBe(true)
    expect(isCurlCommand('  curl https://api.example.com')).toBe(true)
    expect(isCurlCommand('CURL https://api.example.com')).toBe(true)
  })

  it('rejects non-curl strings', () => {
    expect(isCurlCommand('https://api.example.com')).toBe(false)
    expect(isCurlCommand('wget https://api.example.com')).toBe(false)
    expect(isCurlCommand('')).toBe(false)
  })
})

describe('parseCurl', () => {
  it('parses simple GET request', () => {
    const result = parseCurl('curl https://api.example.com/users')
    expect(result.method).toBe('GET')
    expect(result.url).toBe('https://api.example.com/users')
    expect(result.body).toBeNull()
    expect(result.body_type).toBe('none')
  })

  it('parses explicit method', () => {
    const result = parseCurl('curl -X DELETE https://api.example.com/users/1')
    expect(result.method).toBe('DELETE')
    expect(result.url).toBe('https://api.example.com/users/1')
  })

  it('parses --request long flag', () => {
    const result = parseCurl('curl --request PATCH https://api.example.com/users/1')
    expect(result.method).toBe('PATCH')
  })

  it('parses headers', () => {
    const result = parseCurl(`curl -H 'X-Custom: value1' -H 'Accept: text/html' https://example.com`)
    expect(result.headers).toEqual([
      { key: 'X-Custom', value: 'value1', enabled: true },
      { key: 'Accept', value: 'text/html', enabled: true },
    ])
  })

  it('strips Content-Type header when body type is detected', () => {
    const result = parseCurl(`curl -X POST -H 'Content-Type: application/json' -H 'Accept: text/html' -d '{}' https://example.com`)
    // Content-Type is stripped because body_type=json handles it
    expect(result.headers).toEqual([
      { key: 'Accept', value: 'text/html', enabled: true },
    ])
    expect(result.body_type).toBe('json')
  })

  it('parses JSON body with -d', () => {
    const result = parseCurl(`curl -X POST -H 'Content-Type: application/json' -d '{"name":"test"}' https://api.example.com`)
    expect(result.method).toBe('POST')
    expect(result.body).toBe('{"name":"test"}')
    expect(result.body_type).toBe('json')
  })

  it('infers POST when body is present without explicit method', () => {
    const result = parseCurl(`curl -d '{"key":"val"}' https://api.example.com`)
    expect(result.method).toBe('POST')
  })

  it('auto-detects JSON body without Content-Type header', () => {
    const result = parseCurl(`curl -d '{"name":"test","value":123}' https://api.example.com`)
    expect(result.body_type).toBe('json')
  })

  it('auto-detects XML body without Content-Type header', () => {
    const result = parseCurl(`curl -d '<root><item>test</item></root>' https://api.example.com`)
    expect(result.body_type).toBe('xml')
  })

  it('parses --data-urlencode entries', () => {
    const result = parseCurl(`curl --data-urlencode 'name=John' --data-urlencode 'age=30' https://api.example.com`)
    expect(result.body_type).toBe('urlencoded')
    const parsed = JSON.parse(result.body!)
    expect(parsed).toEqual([
      { key: 'name', value: 'John', enabled: true },
      { key: 'age', value: '30', enabled: true },
    ])
  })

  it('parses -F form data entries', () => {
    const result = parseCurl(`curl -F 'file=@/path/to/file' -F 'name=upload' https://api.example.com`)
    expect(result.body_type).toBe('form-data')
    const parsed = JSON.parse(result.body!)
    expect(parsed).toEqual([
      { key: 'file', value: '@/path/to/file', type: 'text', enabled: true },
      { key: 'name', value: 'upload', type: 'text', enabled: true },
    ])
  })

  it('parses basic auth from -u flag', () => {
    const result = parseCurl(`curl -u admin:secret123 https://api.example.com`)
    expect(result.auth).toEqual({
      type: 'basic',
      basic_username: 'admin',
      basic_password: 'secret123',
    })
  })

  it('parses basic auth with empty password', () => {
    const result = parseCurl(`curl -u admin: https://api.example.com`)
    expect(result.auth).toEqual({
      type: 'basic',
      basic_username: 'admin',
      basic_password: '',
    })
  })

  it('extracts bearer auth from Authorization header', () => {
    const result = parseCurl(`curl -H 'Authorization: Bearer mytoken123' https://api.example.com`)
    expect(result.auth).toEqual({
      type: 'bearer',
      bearer_token: 'mytoken123',
    })
    // Authorization header should be removed since auth is extracted
    expect(result.headers.find(h => h.key.toLowerCase() === 'authorization')).toBeUndefined()
  })

  it('extracts basic auth from Authorization header', () => {
    const result = parseCurl(`curl -H 'Authorization: Basic dXNlcjpwYXNz' https://api.example.com`)
    expect(result.auth).toEqual({
      type: 'basic',
      basic_username: 'user',
      basic_password: 'pass',
    })
  })

  it('parses User-Agent from -A flag', () => {
    const result = parseCurl(`curl -A 'MyApp/1.0' https://api.example.com`)
    expect(result.headers).toContainEqual({
      key: 'User-Agent',
      value: 'MyApp/1.0',
      enabled: true,
    })
  })

  it('parses cookies from -b flag', () => {
    const result = parseCurl(`curl -b 'session=abc123' https://api.example.com`)
    expect(result.headers).toContainEqual({
      key: 'Cookie',
      value: 'session=abc123',
      enabled: true,
    })
  })

  it('extracts query params from URL', () => {
    const result = parseCurl('curl https://api.example.com/search?q=test&page=2')
    expect(result.url).toBe('https://api.example.com/search')
    expect(result.queryParams).toEqual([
      { key: 'q', value: 'test', enabled: true },
      { key: 'page', value: '2', enabled: true },
    ])
  })

  it('handles line continuations', () => {
    const result = parseCurl(`curl \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  -d '{"key":"value"}' \\\n  https://api.example.com`)
    expect(result.method).toBe('POST')
    expect(result.url).toBe('https://api.example.com')
    expect(result.body).toBe('{"key":"value"}')
    expect(result.body_type).toBe('json')
  })

  it('handles double-quoted strings', () => {
    const result = parseCurl('curl -H "Accept: application/json" "https://api.example.com"')
    expect(result.headers).toContainEqual({
      key: 'Accept',
      value: 'application/json',
      enabled: true,
    })
    expect(result.url).toBe('https://api.example.com')
  })

  it('handles escaped characters in double quotes', () => {
    const result = parseCurl('curl -d "{\\"name\\":\\"test\\"}" https://api.example.com')
    expect(result.body).toBe('{"name":"test"}')
  })

  it('ignores boolean flags like -L, -k, -s', () => {
    const result = parseCurl('curl -L -k -s --compressed https://api.example.com')
    expect(result.url).toBe('https://api.example.com')
    expect(result.method).toBe('GET')
  })

  it('ignores flags with values we dont use (-o, --proxy, etc)', () => {
    const result = parseCurl('curl -o output.json --connect-timeout 30 https://api.example.com')
    expect(result.url).toBe('https://api.example.com')
  })

  it('handles combined short flags like -sSL', () => {
    const result = parseCurl('curl -sSL https://api.example.com')
    expect(result.url).toBe('https://api.example.com')
    expect(result.method).toBe('GET')
  })

  it('handles $-quoting (ANSI-C)', () => {
    const result = parseCurl("curl -d $'{\"key\":\"value\"}' https://api.example.com")
    expect(result.body).toBe('{"key":"value"}')
  })

  it('handles real-world Chrome DevTools cURL', () => {
    const result = parseCurl(`curl 'https://api.github.com/repos/user/repo' \\
  -H 'accept: application/vnd.github.v3+json' \\
  -H 'authorization: Bearer ghp_abc123' \\
  --compressed`)
    expect(result.method).toBe('GET')
    expect(result.url).toBe('https://api.github.com/repos/user/repo')
    expect(result.auth).toEqual({
      type: 'bearer',
      bearer_token: 'ghp_abc123',
    })
    expect(result.headers).toContainEqual({
      key: 'accept',
      value: 'application/vnd.github.v3+json',
      enabled: true,
    })
  })

  it('handles real-world POST with JSON body', () => {
    const result = parseCurl(`curl -X POST 'https://api.example.com/graphql' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token123' \\
  -d '{"query":"{ viewer { login } }"}'`)
    expect(result.method).toBe('POST')
    expect(result.url).toBe('https://api.example.com/graphql')
    expect(result.body_type).toBe('json')
    expect(result.body).toBe('{"query":"{ viewer { login } }"}')
    expect(result.auth).toEqual({ type: 'bearer', bearer_token: 'token123' })
  })

  it('parses XML body with Content-Type header', () => {
    const result = parseCurl(`curl -X POST -H 'Content-Type: application/xml' -d '<root><item>data</item></root>' https://api.example.com`)
    expect(result.body_type).toBe('xml')
    expect(result.body).toBe('<root><item>data</item></root>')
  })

  it('parses urlencoded body from Content-Type header', () => {
    const result = parseCurl(`curl -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d 'key=value&other=data' https://api.example.com`)
    expect(result.body_type).toBe('urlencoded')
  })

  it('handles --data-raw flag', () => {
    const result = parseCurl(`curl --data-raw '{"test":true}' https://api.example.com`)
    expect(result.body).toBe('{"test":true}')
    expect(result.method).toBe('POST')
  })

  it('parses referer from -e flag', () => {
    const result = parseCurl(`curl -e 'https://google.com' https://api.example.com`)
    expect(result.headers).toContainEqual({
      key: 'Referer',
      value: 'https://google.com',
      enabled: true,
    })
  })

  it('handles URL with {{variables}} in query params', () => {
    const result = parseCurl('curl https://{{base_url}}/api?token={{api_key}}')
    expect(result.url).toBe('https://{{base_url}}/api')
    expect(result.queryParams).toEqual([
      { key: 'token', value: '{{api_key}}', enabled: true },
    ])
  })

  it('returns empty arrays when no headers or params', () => {
    const result = parseCurl('curl https://example.com')
    expect(result.headers).toEqual([])
    expect(result.queryParams).toEqual([])
    expect(result.auth).toBeNull()
  })

  it('handles multiple -d flags (concatenated with &)', () => {
    const result = parseCurl(`curl -d 'name=John' -d 'age=30' https://api.example.com`)
    expect(result.body).toBe('name=John&age=30')
    expect(result.method).toBe('POST')
  })
})
