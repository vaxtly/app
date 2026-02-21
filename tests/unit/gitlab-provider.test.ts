import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitLabProvider } from '../../src/main/sync/gitlab-provider'

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

let provider: GitLabProvider

beforeEach(() => {
  mockFetch.mockReset()
  provider = new GitLabProvider('my-group/my-project', 'glpat-test-token', 'main')
})

describe('testConnection', () => {
  it('calls /projects/{encoded-id} and returns true for 200', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { id: 123 }))
    expect(await provider.testConnection()).toBe(true)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/projects/my-group%2Fmy-project')
  })

  it('project ID is URL-encoded', async () => {
    const special = new GitLabProvider('group/sub/project', 'tok', 'main')
    mockFetch.mockResolvedValue(mockResponse(200, {}))
    await special.testConnection()

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain(encodeURIComponent('group/sub/project'))
  })
})

describe('listFiles', () => {
  it('returns filtered .yaml blobs', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, [
      { type: 'blob', name: 'col1.yaml', path: 'vaxtly/col1.yaml', id: 'blob-1' },
      { type: 'blob', name: 'readme.md', path: 'vaxtly/readme.md', id: 'blob-2' },
      { type: 'tree', name: 'sub', path: 'vaxtly/sub', id: 'tree-1' },
    ], { 'x-next-page': '' }))

    const result = await provider.listFiles('vaxtly')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('vaxtly/col1.yaml')
    expect(result[0].sha).toBe('blob-1')
  })

  it('handles pagination via x-next-page header', async () => {
    // Page 1 — has next page
    mockFetch.mockResolvedValueOnce(mockResponse(200, [
      { type: 'blob', name: 'a.yaml', path: 'vaxtly/a.yaml', id: 'id-a' },
    ], { 'x-next-page': '2' }))

    // Page 2 — no next page
    mockFetch.mockResolvedValueOnce(mockResponse(200, [
      { type: 'blob', name: 'b.yaml', path: 'vaxtly/b.yaml', id: 'id-b' },
    ], { 'x-next-page': '' }))

    const result = await provider.listFiles('vaxtly')
    expect(result).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('stops when x-next-page header is empty', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, [], { 'x-next-page': '' }))
    const result = await provider.listFiles('vaxtly')
    expect(result).toEqual([])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('getFile', () => {
  it('decodes base64 content with blob_id and last_commit_id', async () => {
    const content = Buffer.from('name: Test\n').toString('base64')
    mockFetch.mockResolvedValue(mockResponse(200, {
      content,
      blob_id: 'blob-sha-123',
      last_commit_id: 'commit-sha-456',
    }))

    const result = await provider.getFile('vaxtly/col.yaml')
    expect(result).not.toBeNull()
    expect(result!.content).toBe('name: Test\n')
    expect(result!.sha).toBe('blob-sha-123')
    expect(result!.commitSha).toBe('commit-sha-456')
  })

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, {}))
    expect(await provider.getFile('vaxtly/missing.yaml')).toBeNull()
  })

  it('encodes path in URL', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, {}))
    await provider.getFile('path/with spaces/file.yaml')

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain(encodeURIComponent('path/with spaces/file.yaml'))
  })
})

describe('createFile', () => {
  it('sends POST and re-fetches file for blob_id', async () => {
    // POST create
    mockFetch.mockResolvedValueOnce(mockResponse(201, {}))
    // getFile re-fetch
    const content = Buffer.from('new content').toString('base64')
    mockFetch.mockResolvedValueOnce(mockResponse(200, { content, blob_id: 'new-blob', last_commit_id: 'c1' }))

    const sha = await provider.createFile('vaxtly/new.yaml', 'new content', 'Create file')
    expect(sha).toBe('new-blob')

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.content).toBe('new content')
    expect(body.commit_message).toBe('Create file')
  })
})

describe('updateFile', () => {
  it('uses last_commit_id (not blob SHA) for conflict detection', async () => {
    // PUT update
    mockFetch.mockResolvedValueOnce(mockResponse(200, {}))
    // getFile re-fetch
    const content = Buffer.from('updated').toString('base64')
    mockFetch.mockResolvedValueOnce(mockResponse(200, { content, blob_id: 'updated-blob', last_commit_id: 'c2' }))

    await provider.updateFile('vaxtly/col.yaml', 'updated', 'commit-sha-old', 'Update')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.last_commit_id).toBe('commit-sha-old')
  })

  it('throws statusCode:400 on conflict', async () => {
    mockFetch.mockResolvedValue(mockResponse(400, { message: 'Conflict' }))

    try {
      await provider.updateFile('vaxtly/col.yaml', 'content', 'stale', 'Update')
      expect.fail('Should have thrown')
    } catch (e: any) {
      expect(e.statusCode).toBe(400)
      expect(e.message).toContain('Conflict')
    }
  })
})

describe('deleteFile', () => {
  it('sends DELETE request', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, {}))
    await provider.deleteFile('vaxtly/col.yaml', 'sha', 'Delete file')

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('DELETE')
    const body = JSON.parse(opts.body)
    expect(body.commit_message).toBe('Delete file')
  })

  it('succeeds silently on 404', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, {}))
    await provider.deleteFile('vaxtly/missing.yaml', 'sha', 'Delete')
    // No error thrown
  })
})

describe('commitMultipleFiles', () => {
  it('checks file existence for create vs update action', async () => {
    // getFile check for existing file — returns file
    const content = Buffer.from('old').toString('base64')
    mockFetch.mockResolvedValueOnce(mockResponse(200, { content, blob_id: 'b1', last_commit_id: 'c1' }))
    // Commit POST
    mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'commit-123' }))

    const sha = await provider.commitMultipleFiles(
      { 'vaxtly/existing.yaml': 'updated content' },
      'Batch commit',
    )

    expect(sha).toBe('commit-123')
    const commitBody = JSON.parse(mockFetch.mock.calls[1][1].body)
    // Should be 'update' since file exists
    expect(commitBody.actions[0].action).toBe('update')
  })

  it('includes deletions in actions', async () => {
    // Commit POST (no files to check existence for)
    mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'commit-456' }))

    await provider.commitMultipleFiles({}, 'Delete batch', ['vaxtly/old.yaml', 'vaxtly/old2.yaml'])

    const commitBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(commitBody.actions).toHaveLength(2)
    expect(commitBody.actions[0].action).toBe('delete')
    expect(commitBody.actions[1].action).toBe('delete')
  })
})

describe('Auth header', () => {
  it('sends PRIVATE-TOKEN header (not Bearer)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, {}))
    await provider.testConnection()

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['PRIVATE-TOKEN']).toBe('glpat-test-token')
    expect(opts.headers.Authorization).toBeUndefined()
  })
})
