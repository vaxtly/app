import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { serializeToDirectory, importFromDirectory, serializeRequest } from '../../src/main/services/yaml-serializer'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as foldersRepo from '../../src/main/database/repositories/folders'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import type { FileContent } from '../../src/shared/types/sync'

beforeEach(() => openTestDatabase())
afterEach(() => closeDatabase())

describe('serializeToDirectory', () => {
  it('serializes a collection with requests to YAML files', () => {
    const collection = collectionsRepo.create({ name: 'Test Collection' })
    requestsRepo.create({
      collection_id: collection.id,
      name: 'Get Users',
      method: 'GET',
      url: 'https://api.example.com/users',
    })
    requestsRepo.create({
      collection_id: collection.id,
      name: 'Create User',
      method: 'POST',
      url: 'https://api.example.com/users',
    })

    const files = serializeToDirectory(collection)

    // Should have: _collection.yaml, _manifest.yaml, and 2 request files
    const paths = Object.keys(files)
    expect(paths).toHaveLength(4)
    expect(paths.find((p) => p.endsWith('/_collection.yaml'))).toBeTruthy()
    expect(paths.find((p) => p.endsWith('/_manifest.yaml'))).toBeTruthy()

    // Collection file should contain name
    const collFile = Object.entries(files).find(([p]) => p.endsWith('/_collection.yaml'))!
    expect(collFile[1]).toContain('Test Collection')
  })

  it('serializes nested folders', () => {
    const collection = collectionsRepo.create({ name: 'Nested' })
    const folder = foldersRepo.create({
      collection_id: collection.id,
      name: 'Auth',
    })
    requestsRepo.create({
      collection_id: collection.id,
      name: 'Login',
      folder_id: folder.id,
    })

    const files = serializeToDirectory(collection)
    const paths = Object.keys(files)

    // Should have folder files
    expect(paths.find((p) => p.includes(folder.id) && p.endsWith('/_folder.yaml'))).toBeTruthy()
    expect(paths.find((p) => p.includes(folder.id) && p.endsWith('/_manifest.yaml'))).toBeTruthy()
  })

  it('builds manifest with correct ordering', () => {
    const collection = collectionsRepo.create({ name: 'Ordered' })
    const folder = foldersRepo.create({ collection_id: collection.id, name: 'Folder1' })
    const req = requestsRepo.create({ collection_id: collection.id, name: 'Req1' })

    const files = serializeToDirectory(collection)
    const manifestPath = Object.keys(files).find(
      (p) => p === `${collection.id}/_manifest.yaml`,
    )!
    const manifest = files[manifestPath]

    expect(manifest).toContain('folder')
    expect(manifest).toContain('request')
    expect(manifest).toContain(folder.id)
    expect(manifest).toContain(req.id)
  })
})

describe('serializeRequest', () => {
  it('produces YAML with all fields', () => {
    const collection = collectionsRepo.create({ name: 'Test' })
    const request = requestsRepo.create({
      collection_id: collection.id,
      name: 'Test Request',
      method: 'POST',
      url: 'https://api.example.com',
    })

    // Update with more fields
    requestsRepo.update(request.id, {
      headers: JSON.stringify([{ key: 'Content-Type', value: 'application/json', enabled: true }]),
      body: '{"test": true}',
      body_type: 'json',
    })

    const updated = requestsRepo.findById(request.id)!
    const yamlContent = serializeRequest(updated)

    expect(yamlContent).toContain('Test Request')
    expect(yamlContent).toContain('POST')
    expect(yamlContent).toContain('https://api.example.com')
    expect(yamlContent).toContain('Content-Type')
  })

  it('strips file references from form-data', () => {
    const collection = collectionsRepo.create({ name: 'Test' })
    const request = requestsRepo.create({
      collection_id: collection.id,
      name: 'Upload',
      method: 'POST',
    })
    requestsRepo.update(request.id, {
      body_type: 'form-data',
      body: JSON.stringify([
        { key: 'file', value: '/tmp/local/path.pdf', type: 'file', filename: 'doc.pdf' },
        { key: 'name', value: 'test', type: 'text' },
      ]),
    })

    const updated = requestsRepo.findById(request.id)!
    const yamlContent = serializeRequest(updated)

    // File path should be stripped
    expect(yamlContent).not.toContain('/tmp/local/path.pdf')
    // Filename should be preserved
    expect(yamlContent).toContain('doc.pdf')
  })
})

describe('importFromDirectory', () => {
  it('imports a collection from YAML files', () => {
    // First serialize a collection
    const original = collectionsRepo.create({ name: 'Export Me' })
    requestsRepo.create({
      collection_id: original.id,
      name: 'My Request',
      method: 'GET',
      url: 'https://example.com',
    })

    const files = serializeToDirectory(original)

    // Convert to FileContent array (simulating remote)
    const fileContents: FileContent[] = Object.entries(files).map(([path, content]) => ({
      path: `collections/${path}`,
      content,
      sha: 'fake-sha',
    }))

    // Delete original
    collectionsRepo.remove(original.id)

    // Import
    const newId = importFromDirectory(fileContents)
    expect(newId).toBe(original.id)

    // Verify
    const imported = collectionsRepo.findById(newId)
    expect(imported).toBeTruthy()
    expect(imported!.name).toBe('Export Me')

    const requests = requestsRepo.findByCollection(newId)
    expect(requests).toHaveLength(1)
    expect(requests[0].name).toBe('My Request')
  })

  it('imports into an existing collection (update)', () => {
    const existing = collectionsRepo.create({ name: 'Old Name' })
    requestsRepo.create({ collection_id: existing.id, name: 'Old Request' })

    // Create a different collection to serialize
    const source = collectionsRepo.create({ name: 'New Name' })
    requestsRepo.create({
      collection_id: source.id,
      name: 'New Request',
      method: 'POST',
      url: 'https://new.com',
    })

    const files = serializeToDirectory(source)
    const fileContents: FileContent[] = Object.entries(files).map(([path, content]) => ({
      path: `collections/${path}`,
      content,
    }))

    // Remove source so its request IDs don't conflict on import
    collectionsRepo.remove(source.id)

    // Import into existing collection
    const id = importFromDirectory(fileContents, existing.id)
    expect(id).toBe(existing.id)

    const updated = collectionsRepo.findById(existing.id)
    expect(updated!.name).toBe('New Name')

    const requests = requestsRepo.findByCollection(existing.id)
    expect(requests).toHaveLength(1)
    expect(requests[0].name).toBe('New Request')
  })

  it('imports nested folders correctly', () => {
    const collection = collectionsRepo.create({ name: 'With Folders' })
    const folder = foldersRepo.create({ collection_id: collection.id, name: 'API' })
    requestsRepo.create({
      collection_id: collection.id,
      folder_id: folder.id,
      name: 'Nested Request',
    })

    const files = serializeToDirectory(collection)
    const fileContents: FileContent[] = Object.entries(files).map(([path, content]) => ({
      path: `collections/${path}`,
      content,
    }))

    // Delete and reimport
    collectionsRepo.remove(collection.id)
    const newId = importFromDirectory(fileContents)

    const folders = foldersRepo.findByCollection(newId)
    expect(folders).toHaveLength(1)
    expect(folders[0].name).toBe('API')

    const requests = requestsRepo.findByFolder(folders[0].id, newId)
    expect(requests).toHaveLength(1)
    expect(requests[0].name).toBe('Nested Request')
  })
})
