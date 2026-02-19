import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import {
  buildFileStateFromRemote,
  normalizeFileState,
  hasRemoteFileChanges,
  isConfigured,
  getProvider,
} from '../../src/main/sync/remote-sync-service'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import type { FileContent } from '../../src/shared/types/sync'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => closeDatabase())

describe('buildFileStateFromRemote', () => {
  it('builds state from file contents', () => {
    const files: FileContent[] = [
      { path: 'collections/abc/_collection.yaml', content: 'name: Test', sha: 'sha1' },
      { path: 'collections/abc/req1.yaml', content: 'method: GET', sha: 'sha2', commitSha: 'commit1' },
    ]

    const state = buildFileStateFromRemote(files)

    expect(Object.keys(state)).toHaveLength(2)
    expect(state['collections/abc/_collection.yaml'].remote_sha).toBe('sha1')
    expect(state['collections/abc/_collection.yaml'].content_hash).toBeTruthy()
    expect(state['collections/abc/req1.yaml'].commit_sha).toBe('commit1')
  })

  it('handles files without sha', () => {
    const files: FileContent[] = [
      { path: 'test.yaml', content: 'hello' },
    ]

    const state = buildFileStateFromRemote(files)
    expect(state['test.yaml'].remote_sha).toBeNull()
  })
})

describe('normalizeFileState', () => {
  it('normalizes new array format', () => {
    const state = normalizeFileState({
      'path/a.yaml': {
        content_hash: 'hash1',
        remote_sha: 'sha1',
        commit_sha: 'commit1',
      },
    })

    expect(state['path/a.yaml'].content_hash).toBe('hash1')
    expect(state['path/a.yaml'].remote_sha).toBe('sha1')
    expect(state['path/a.yaml'].commit_sha).toBe('commit1')
  })

  it('normalizes old flat-string format', () => {
    const state = normalizeFileState({
      'path/a.yaml': 'old-sha-string',
    })

    expect(state['path/a.yaml'].remote_sha).toBe('old-sha-string')
    expect(state['path/a.yaml'].content_hash).toBe('')
    expect(state['path/a.yaml'].commit_sha).toBeNull()
  })

  it('handles missing fields gracefully', () => {
    const state = normalizeFileState({
      'path/a.yaml': { content_hash: 'hash1' },
    })

    expect(state['path/a.yaml'].content_hash).toBe('hash1')
    expect(state['path/a.yaml'].remote_sha).toBeNull()
    expect(state['path/a.yaml'].commit_sha).toBeNull()
  })
})

describe('hasRemoteFileChanges', () => {
  it('returns false when remote matches stored state', () => {
    const stored = {
      'collections/abc/a.yaml': {
        content_hash: 'hash1',
        remote_sha: 'sha1',
        commit_sha: null,
      },
    }

    const remoteItems = [
      { type: 'file' as const, path: 'collections/abc/a.yaml', sha: 'sha1' },
    ]

    expect(hasRemoteFileChanges(stored, remoteItems)).toBe(false)
  })

  it('returns true when remote SHA differs', () => {
    const stored = {
      'collections/abc/a.yaml': {
        content_hash: 'hash1',
        remote_sha: 'sha1',
        commit_sha: null,
      },
    }

    const remoteItems = [
      { type: 'file' as const, path: 'collections/abc/a.yaml', sha: 'sha2-changed' },
    ]

    expect(hasRemoteFileChanges(stored, remoteItems)).toBe(true)
  })

  it('returns true when new file appears on remote', () => {
    const stored = {
      'collections/abc/a.yaml': {
        content_hash: 'hash1',
        remote_sha: 'sha1',
        commit_sha: null,
      },
    }

    const remoteItems = [
      { type: 'file' as const, path: 'collections/abc/a.yaml', sha: 'sha1' },
      { type: 'file' as const, path: 'collections/abc/b.yaml', sha: 'sha-new' },
    ]

    expect(hasRemoteFileChanges(stored, remoteItems)).toBe(true)
  })

  it('returns true when file deleted on remote', () => {
    const stored = {
      'collections/abc/a.yaml': {
        content_hash: 'hash1',
        remote_sha: 'sha1',
        commit_sha: null,
      },
      'collections/abc/b.yaml': {
        content_hash: 'hash2',
        remote_sha: 'sha2',
        commit_sha: null,
      },
    }

    const remoteItems = [
      { type: 'file' as const, path: 'collections/abc/a.yaml', sha: 'sha1' },
      // b.yaml is missing from remote
    ]

    expect(hasRemoteFileChanges(stored, remoteItems)).toBe(true)
  })

  it('ignores directory entries in remote items', () => {
    const stored = {
      'collections/abc/a.yaml': {
        content_hash: 'hash1',
        remote_sha: 'sha1',
        commit_sha: null,
      },
    }

    const remoteItems = [
      { type: 'file' as const, path: 'collections/abc/a.yaml', sha: 'sha1' },
      { type: 'dir' as const, path: 'collections/abc/subfolder', sha: 'tree-sha' },
    ]

    expect(hasRemoteFileChanges(stored, remoteItems)).toBe(false)
  })

  it('handles empty stored state (first pull)', () => {
    const stored = {}

    const remoteItems = [
      { type: 'file' as const, path: 'collections/abc/a.yaml', sha: 'sha1' },
    ]

    expect(hasRemoteFileChanges(stored, remoteItems)).toBe(true)
  })

  it('handles backward compat with old flat-string format', () => {
    const stored = {
      'collections/abc/a.yaml': 'sha1', // old format
    }

    const remoteItems = [
      { type: 'file' as const, path: 'collections/abc/a.yaml', sha: 'sha1' },
    ]

    expect(hasRemoteFileChanges(stored, remoteItems)).toBe(false)
  })
})

describe('SyncConflictError', () => {
  it('has correct properties', async () => {
    const { SyncConflictError } = await import('../../src/main/sync/remote-sync-service')
    const err = new SyncConflictError(['file-a.yaml', 'file-b.yaml'])
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('SyncConflictError')
    expect(err.conflictedFiles).toEqual(['file-a.yaml', 'file-b.yaml'])
    expect(err.message).toContain('file-a.yaml')
  })
})

describe('isConfigured', () => {
  it('returns false when no sync settings configured', () => {
    expect(isConfigured()).toBe(false)
  })

  it('returns true when provider, repository, and token are set', () => {
    settingsRepo.setSetting('sync.provider', 'github')
    settingsRepo.setSetting('sync.repository', 'user/repo')
    settingsRepo.setSetting('sync.token', 'ghp_test123')
    expect(isConfigured()).toBe(true)
  })
})

describe('getProvider', () => {
  it('returns null with incomplete settings', () => {
    settingsRepo.setSetting('sync.provider', 'github')
    expect(getProvider()).toBeNull()
  })

  it('returns GitHubProvider with complete github settings', () => {
    settingsRepo.setSetting('sync.provider', 'github')
    settingsRepo.setSetting('sync.repository', 'user/repo')
    settingsRepo.setSetting('sync.token', 'ghp_test123')
    const provider = getProvider()
    expect(provider).not.toBeNull()
    expect(provider!.constructor.name).toBe('GitHubProvider')
  })

  it('returns GitLabProvider with gitlab settings', () => {
    settingsRepo.setSetting('sync.provider', 'gitlab')
    settingsRepo.setSetting('sync.repository', 'group/project')
    settingsRepo.setSetting('sync.token', 'glpat_test123')
    const provider = getProvider()
    expect(provider).not.toBeNull()
    expect(provider!.constructor.name).toBe('GitLabProvider')
  })

  it('returns null when token is missing', () => {
    settingsRepo.setSetting('sync.provider', 'github')
    settingsRepo.setSetting('sync.repository', 'user/repo')
    // No token
    expect(getProvider()).toBeNull()
  })
})
