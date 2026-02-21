import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitHubProvider } from '../../src/main/sync/github-provider'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockResponse(status: number, json: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(typeof json === 'string' ? json : JSON.stringify(json)),
    headers: new Headers(headers),
  }
}

let provider: GitHubProvider

beforeEach(() => {
  mockFetch.mockReset()
  provider = new GitHubProvider('owner/repo', 'ghp_test-token', 'main')
})

describe('testConnection', () => {
  it('returns true for 200', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { full_name: 'owner/repo' }))
    expect(await provider.testConnection()).toBe(true)
  })

  it('returns false for non-200', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, { message: 'Not Found' }))
    expect(await provider.testConnection()).toBe(false)
  })
})

describe('listFiles', () => {
  it('returns filtered .yaml files', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, [
      { type: 'file', name: 'col1.yaml', path: 'vaxtly/col1.yaml', sha: 'abc' },
      { type: 'file', name: 'readme.md', path: 'vaxtly/readme.md', sha: 'def' },
      { type: 'dir', name: 'sub', path: 'vaxtly/sub', sha: 'ghi' },
    ]))

    const result = await provider.listFiles('vaxtly')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('vaxtly/col1.yaml')
    expect(result[0].sha).toBe('abc')
  })

  it('returns [] on 404', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, { message: 'Not Found' }))
    const result = await provider.listFiles('nonexistent')
    expect(result).toEqual([])
  })
})

describe('getFile', () => {
  it('decodes base64 content and returns SHA', async () => {
    const content = Buffer.from('name: Test Collection\n').toString('base64')
    mockFetch.mockResolvedValue(mockResponse(200, { content, sha: 'blob-sha-123' }))

    const result = await provider.getFile('vaxtly/col1.yaml')
    expect(result).not.toBeNull()
    expect(result!.content).toBe('name: Test Collection\n')
    expect(result!.sha).toBe('blob-sha-123')
  })

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, { message: 'Not Found' }))
    const result = await provider.getFile('vaxtly/missing.yaml')
    expect(result).toBeNull()
  })
})

describe('createFile', () => {
  it('sends base64-encoded content', async () => {
    mockFetch.mockResolvedValue(mockResponse(201, { content: { sha: 'new-sha' } }))

    const sha = await provider.createFile('vaxtly/col.yaml', 'name: New', 'Add collection')
    expect(sha).toBe('new-sha')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/repos/owner/repo/contents/vaxtly/col.yaml')
    expect(opts.method).toBe('PUT')
    const body = JSON.parse(opts.body)
    expect(body.content).toBe(Buffer.from('name: New').toString('base64'))
    expect(body.message).toBe('Add collection')
    expect(body.branch).toBe('main')
  })
})

describe('updateFile', () => {
  it('includes SHA for conflict detection', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { content: { sha: 'updated-sha' } }))

    const sha = await provider.updateFile('vaxtly/col.yaml', 'name: Updated', 'old-sha-123', 'Update collection')
    expect(sha).toBe('updated-sha')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sha).toBe('old-sha-123')
  })

  it('throws statusCode:409 on conflict', async () => {
    mockFetch.mockResolvedValue(mockResponse(409, { message: 'Conflict' }))

    try {
      await provider.updateFile('vaxtly/col.yaml', 'content', 'stale-sha', 'Update')
      expect.fail('Should have thrown')
    } catch (e: any) {
      expect(e.statusCode).toBe(409)
      expect(e.message).toContain('SHA conflict')
    }
  })
})

describe('deleteFile', () => {
  it('sends correct body', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, {}))
    await provider.deleteFile('vaxtly/col.yaml', 'sha-123', 'Delete file')

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('DELETE')
    const body = JSON.parse(opts.body)
    expect(body.sha).toBe('sha-123')
    expect(body.message).toBe('Delete file')
  })

  it('succeeds silently on 404', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, {}))
    // Should not throw
    await provider.deleteFile('vaxtly/missing.yaml', 'sha', 'Delete')
  })
})

describe('commitMultipleFiles', () => {
  it('follows 5-step atomic flow', async () => {
    // Step 1: Get ref
    mockFetch.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'commit-sha-1' } }))
    // Step 2: Get commit
    mockFetch.mockResolvedValueOnce(mockResponse(200, { tree: { sha: 'tree-sha-1' } }))
    // Step 3: Create tree
    mockFetch.mockResolvedValueOnce(mockResponse(201, { sha: 'new-tree-sha' }))
    // Step 4: Create commit
    mockFetch.mockResolvedValueOnce(mockResponse(201, { sha: 'new-commit-sha' }))
    // Step 5: Update ref
    mockFetch.mockResolvedValueOnce(mockResponse(200, {}))

    const sha = await provider.commitMultipleFiles(
      { 'vaxtly/col.yaml': 'content-1' },
      'Batch commit',
    )

    expect(sha).toBe('new-commit-sha')
    expect(mockFetch).toHaveBeenCalledTimes(5)

    // Verify tree creation includes file content
    const treeCall = mockFetch.mock.calls[2]
    const treeBody = JSON.parse(treeCall[1].body)
    expect(treeBody.base_tree).toBe('tree-sha-1')
    expect(treeBody.tree[0].path).toBe('vaxtly/col.yaml')
    expect(treeBody.tree[0].content).toBe('content-1')
  })

  it('handles deletions (sha:null in tree)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'c1' } }))
    mockFetch.mockResolvedValueOnce(mockResponse(200, { tree: { sha: 't1' } }))
    mockFetch.mockResolvedValueOnce(mockResponse(201, { sha: 'nt' }))
    mockFetch.mockResolvedValueOnce(mockResponse(201, { sha: 'nc' }))
    mockFetch.mockResolvedValueOnce(mockResponse(200, {}))

    await provider.commitMultipleFiles({}, 'Delete files', ['vaxtly/old.yaml'])

    const treeBody = JSON.parse(mockFetch.mock.calls[2][1].body)
    const deleteItem = treeBody.tree.find((t: any) => t.path === 'vaxtly/old.yaml')
    expect(deleteItem.sha).toBeNull()
  })
})

describe('listDirectoryRecursive', () => {
  it('uses Tree API with recursive=1', async () => {
    // Step 1: Get ref
    mockFetch.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'ref-sha' } }))
    // Step 2: Get commit
    mockFetch.mockResolvedValueOnce(mockResponse(200, { tree: { sha: 'tree-sha' } }))
    // Step 3: Get tree recursively
    mockFetch.mockResolvedValueOnce(mockResponse(200, {
      tree: [
        { type: 'blob', path: 'vaxtly/col1.yaml', sha: 'sha1' },
        { type: 'tree', path: 'vaxtly/sub', sha: 'sha2' },
        { type: 'blob', path: 'other/file.txt', sha: 'sha3' },
      ],
    }))

    const result = await provider.listDirectoryRecursive('vaxtly')

    // Should filter by path prefix
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('vaxtly/col1.yaml')
    expect(result[1].path).toBe('vaxtly/sub')

    // Verify the tree API call includes recursive=1
    const treeUrl = mockFetch.mock.calls[2][0]
    expect(treeUrl).toContain('recursive=1')
  })
})

describe('Auth headers', () => {
  it('sends Bearer token and Accept header', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, {}))
    await provider.testConnection()

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer ghp_test-token')
    expect(opts.headers.Accept).toBe('application/vnd.github+json')
  })
})
