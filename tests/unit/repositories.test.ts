import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase, getDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as foldersRepo from '../../src/main/database/repositories/folders'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import * as historiesRepo from '../../src/main/database/repositories/request-histories'
import * as settingsRepo from '../../src/main/database/repositories/settings'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})

afterEach(() => {
  closeDatabase()
})

// --- Workspaces ---

describe('workspaces repository', () => {
  it('creates and retrieves a workspace', () => {
    const ws = workspacesRepo.create({ name: 'Test Workspace' })
    expect(ws.id).toBeDefined()
    expect(ws.name).toBe('Test Workspace')
    expect(ws.description).toBeNull()

    const found = workspacesRepo.findById(ws.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Test Workspace')
  })

  it('lists all workspaces ordered', () => {
    workspacesRepo.create({ name: 'B' })
    workspacesRepo.create({ name: 'A' })
    const all = workspacesRepo.findAll()
    expect(all).toHaveLength(2)
    expect(all[0].name).toBe('B')
    expect(all[1].name).toBe('A')
  })

  it('updates a workspace', () => {
    const ws = workspacesRepo.create({ name: 'Original' })
    const updated = workspacesRepo.update(ws.id, { name: 'Updated', description: 'Desc' })
    expect(updated!.name).toBe('Updated')
    expect(updated!.description).toBe('Desc')
  })

  it('deletes a workspace', () => {
    const ws = workspacesRepo.create({ name: 'Delete Me' })
    expect(workspacesRepo.remove(ws.id)).toBe(true)
    expect(workspacesRepo.findById(ws.id)).toBeUndefined()
  })

  it('reorders workspaces', () => {
    const a = workspacesRepo.create({ name: 'A' })
    const b = workspacesRepo.create({ name: 'B' })
    workspacesRepo.reorder([b.id, a.id])
    const all = workspacesRepo.findAll()
    expect(all[0].id).toBe(b.id)
    expect(all[1].id).toBe(a.id)
  })
})

// --- Collections ---

describe('collections repository', () => {
  it('creates and retrieves a collection', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const col = collectionsRepo.create({ name: 'My API', workspace_id: ws.id })
    expect(col.id).toBeDefined()
    expect(col.name).toBe('My API')
    expect(col.workspace_id).toBe(ws.id)
    expect(col.is_dirty).toBe(0)
  })

  it('finds collections by workspace', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    collectionsRepo.create({ name: 'Col 1', workspace_id: ws.id })
    collectionsRepo.create({ name: 'Col 2', workspace_id: ws.id })
    const cols = collectionsRepo.findByWorkspace(ws.id)
    expect(cols).toHaveLength(2)
  })

  it('marks dirty and clears dirty', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    expect(col.is_dirty).toBe(0)

    collectionsRepo.markDirty(col.id)
    expect(collectionsRepo.findById(col.id)!.is_dirty).toBe(1)

    collectionsRepo.clearDirty(col.id)
    expect(collectionsRepo.findById(col.id)!.is_dirty).toBe(0)
  })

  it('cascades delete from workspace', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const col = collectionsRepo.create({ name: 'Col', workspace_id: ws.id })
    workspacesRepo.remove(ws.id)
    expect(collectionsRepo.findById(col.id)).toBeUndefined()
  })
})

// --- Folders ---

describe('folders repository', () => {
  it('creates nested folders', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const parent = foldersRepo.create({ collection_id: col.id, name: 'Parent' })
    const child = foldersRepo.create({ collection_id: col.id, name: 'Child', parent_id: parent.id })

    expect(child.parent_id).toBe(parent.id)

    const children = foldersRepo.findByParent(parent.id, col.id)
    expect(children).toHaveLength(1)
    expect(children[0].name).toBe('Child')
  })

  it('cascades delete from collection', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const folder = foldersRepo.create({ collection_id: col.id, name: 'F' })
    collectionsRepo.remove(col.id)
    expect(foldersRepo.findById(folder.id)).toBeUndefined()
  })

  it('cascades delete from parent folder', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const parent = foldersRepo.create({ collection_id: col.id, name: 'Parent' })
    const child = foldersRepo.create({ collection_id: col.id, name: 'Child', parent_id: parent.id })
    foldersRepo.remove(parent.id)
    expect(foldersRepo.findById(child.id)).toBeUndefined()
  })
})

// --- Requests ---

describe('requests repository', () => {
  it('creates a request with defaults', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Get Users' })
    expect(req.method).toBe('GET')
    expect(req.url).toBe('')
    expect(req.body_type).toBe('json')
  })

  it('creates a request in a folder', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const folder = foldersRepo.create({ collection_id: col.id, name: 'Auth' })
    const req = requestsRepo.create({
      collection_id: col.id,
      name: 'Login',
      folder_id: folder.id,
      method: 'POST',
    })
    expect(req.folder_id).toBe(folder.id)
    expect(req.method).toBe('POST')

    const inFolder = requestsRepo.findByFolder(folder.id, col.id)
    expect(inFolder).toHaveLength(1)
  })

  it('updates request fields', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Test' })
    const updated = requestsRepo.update(req.id, {
      url: 'https://api.example.com',
      method: 'POST',
      headers: JSON.stringify([{ key: 'Accept', value: 'application/json', enabled: true }]),
      body: '{"test": true}',
      body_type: 'json',
    })
    expect(updated!.url).toBe('https://api.example.com')
    expect(updated!.method).toBe('POST')
    expect(JSON.parse(updated!.headers!)).toHaveLength(1)
  })

  it('moves a request to a different folder', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const f1 = foldersRepo.create({ collection_id: col.id, name: 'F1' })
    const f2 = foldersRepo.create({ collection_id: col.id, name: 'F2' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R', folder_id: f1.id })

    const moved = requestsRepo.move(req.id, f2.id)
    expect(moved!.folder_id).toBe(f2.id)
  })

  it('sets folder_id to null on folder delete', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const folder = foldersRepo.create({ collection_id: col.id, name: 'F' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R', folder_id: folder.id })

    foldersRepo.remove(folder.id)
    const found = requestsRepo.findById(req.id)
    expect(found).toBeDefined()
    expect(found!.folder_id).toBeNull()
  })
})

// --- Environments ---

describe('environments repository', () => {
  it('creates and activates environments', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env1 = environmentsRepo.create({ name: 'Dev', workspace_id: ws.id })
    const env2 = environmentsRepo.create({ name: 'Prod', workspace_id: ws.id })

    expect(env1.is_active).toBe(0)

    environmentsRepo.activate(env1.id, ws.id)
    expect(environmentsRepo.findById(env1.id)!.is_active).toBe(1)

    // Activating env2 should deactivate env1
    environmentsRepo.activate(env2.id, ws.id)
    expect(environmentsRepo.findById(env1.id)!.is_active).toBe(0)
    expect(environmentsRepo.findById(env2.id)!.is_active).toBe(1)
  })

  it('deactivates an environment', () => {
    const env = environmentsRepo.create({ name: 'Test' })
    environmentsRepo.activate(env.id)
    expect(environmentsRepo.findById(env.id)!.is_active).toBe(1)

    environmentsRepo.deactivate(env.id)
    expect(environmentsRepo.findById(env.id)!.is_active).toBe(0)
  })

  it('stores variables as JSON', () => {
    const vars = JSON.stringify([
      { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
      { key: 'token', value: 'abc123', enabled: true },
    ])
    const env = environmentsRepo.create({ name: 'Dev', variables: vars })
    const parsed = JSON.parse(env.variables)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].key).toBe('baseUrl')
  })
})

// --- Request Histories ---

describe('request-histories repository', () => {
  it('creates and retrieves history entries', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })

    const h = historiesRepo.create({
      request_id: req.id,
      method: 'GET',
      url: 'https://example.com',
      status_code: 200,
      duration_ms: 150,
      response_body: '{"ok": true}',
    })

    expect(h.id).toBeDefined()
    expect(h.status_code).toBe(200)

    const list = historiesRepo.findByRequest(req.id)
    expect(list).toHaveLength(1)
  })

  it('prunes old entries', () => {
    const col = collectionsRepo.create({ name: 'Col' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })

    historiesRepo.create({
      request_id: req.id,
      method: 'GET',
      url: 'https://example.com',
    })

    // Prune with future cutoff (negative days = delete everything created before tomorrow)
    // Use a very large retention window that still catches the entry
    // The entry's executed_at is "now", so we need cutoff > now
    // prune(-1) sets cutoff to tomorrow, so everything before tomorrow gets deleted
    const pruned = historiesRepo.prune(-1)
    expect(pruned).toBe(1)
    expect(historiesRepo.findByRequest(req.id)).toHaveLength(0)
  })
})

// --- Settings ---

describe('settings repository', () => {
  it('gets and sets settings', () => {
    expect(settingsRepo.getSetting('theme')).toBeUndefined()

    settingsRepo.setSetting('theme', 'dark')
    expect(settingsRepo.getSetting('theme')).toBe('dark')

    settingsRepo.setSetting('theme', 'light')
    expect(settingsRepo.getSetting('theme')).toBe('light')
  })

  it('gets all settings', () => {
    settingsRepo.setSetting('a', '1')
    settingsRepo.setSetting('b', '2')
    const all = settingsRepo.getAllSettings()
    expect(all).toHaveLength(2)
  })

  it('saves and retrieves window state', () => {
    settingsRepo.saveWindowState({
      x: 100,
      y: 200,
      width: 1400,
      height: 900,
      is_maximized: 1,
    })

    const state = settingsRepo.getWindowState()
    expect(state.x).toBe(100)
    expect(state.y).toBe(200)
    expect(state.width).toBe(1400)
    expect(state.height).toBe(900)
    expect(state.is_maximized).toBe(1)
  })

  it('returns defaults when no window state saved', () => {
    const state = settingsRepo.getWindowState()
    expect(state.width).toBe(1200)
    expect(state.height).toBe(800)
    expect(state.is_maximized).toBe(0)
  })

  it('round-trips sensitive key (vault.token)', () => {
    settingsRepo.setSetting('vault.token', 'hvs.my-secret-token')
    expect(settingsRepo.getSetting('vault.token')).toBe('hvs.my-secret-token')
  })

  it('removes a setting', () => {
    settingsRepo.setSetting('foo', 'bar')
    expect(settingsRepo.removeSetting('foo')).toBe(true)
    expect(settingsRepo.getSetting('foo')).toBeUndefined()
    expect(settingsRepo.removeSetting('nonexistent')).toBe(false)
  })

  it('sensitive key is actually encrypted in raw DB', () => {
    settingsRepo.setSetting('sync.token', 'ghp_plaintext123')
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('sync.token') as { value: string }
    expect(row.value).not.toBe('ghp_plaintext123')
    // Decrypted value should still match
    expect(settingsRepo.getSetting('sync.token')).toBe('ghp_plaintext123')
  })
})

// --- Workspace-scoped settings ---

describe('workspace-scoped settings', () => {
  it('sets and gets workspace-scoped settings', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    workspacesRepo.setWorkspaceSetting(ws.id, 'sync.provider', 'github')
    expect(workspacesRepo.getWorkspaceSetting(ws.id, 'sync.provider')).toBe('github')
  })

  it('encrypts sensitive workspace-scoped keys', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    workspacesRepo.setWorkspaceSetting(ws.id, 'sync.token', 'ghp_secret')
    // Round-trip should work
    expect(workspacesRepo.getWorkspaceSetting(ws.id, 'sync.token')).toBe('ghp_secret')
    // Raw DB should be encrypted
    const raw = workspacesRepo.findById(ws.id)!
    const settings = JSON.parse(raw.settings!)
    expect(settings.sync.token).not.toBe('ghp_secret')
  })
})

// --- Collections reorder ---

describe('collections repository — reorder', () => {
  it('reorders collections', () => {
    const a = collectionsRepo.create({ name: 'A' })
    const b = collectionsRepo.create({ name: 'B' })
    const c = collectionsRepo.create({ name: 'C' })

    collectionsRepo.reorder([c.id, a.id, b.id])
    const all = collectionsRepo.findAll()
    expect(all[0].id).toBe(c.id)
    expect(all[1].id).toBe(a.id)
    expect(all[2].id).toBe(b.id)
  })
})

// --- Requests cross-collection move ---

describe('requests repository — cross-collection move', () => {
  it('moves a request to a different collection', () => {
    const col1 = collectionsRepo.create({ name: 'Col1' })
    const col2 = collectionsRepo.create({ name: 'Col2' })
    const req = requestsRepo.create({ collection_id: col1.id, name: 'R' })

    const moved = requestsRepo.move(req.id, null, col2.id)
    expect(moved!.collection_id).toBe(col2.id)
    expect(moved!.folder_id).toBeNull()

    expect(requestsRepo.findByCollection(col1.id)).toHaveLength(0)
    expect(requestsRepo.findByCollection(col2.id)).toHaveLength(1)
  })
})

// --- Environments encryption ---

describe('environments repository — encryption', () => {
  it('round-trips encrypted variable values', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const vars = JSON.stringify([
      { key: 'API_KEY', value: 'sk-secret-123', enabled: true },
      { key: 'BASE_URL', value: 'https://api.com', enabled: true },
    ])
    const env = environmentsRepo.create({ name: 'Prod', workspace_id: ws.id, variables: vars })
    const found = environmentsRepo.findById(env.id)!
    const parsed = JSON.parse(found.variables)
    expect(parsed[0].value).toBe('sk-secret-123')
    expect(parsed[1].value).toBe('https://api.com')
  })
})
