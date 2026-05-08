/**
 * Tests for the environment parent/child inheritance feature:
 * - Repo guards (cycle, depth cap, cross-workspace)
 * - Variable resolver merge order (parent → child → collection)
 * - Mirror-back closest-ancestor routing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import { getResolvedVariables, substitute } from '../../src/main/services/variable-substitution'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})

afterEach(() => {
  closeDatabase()
})

describe('environments repository — parent/child', () => {
  it('creates a child env with parent_id and findChildren returns it', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const root = environmentsRepo.create({ name: 'Myapp', workspace_id: ws.id })
    const child = environmentsRepo.create({ name: 'local', workspace_id: ws.id, parent_id: root.id })

    expect(child.parent_id).toBe(root.id)
    expect(environmentsRepo.findChildren(root.id).map((e) => e.id)).toEqual([child.id])
  })

  it('findChain returns [root, child] for a child env, [self] for a root', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const root = environmentsRepo.create({ name: 'Myapp', workspace_id: ws.id })
    const child = environmentsRepo.create({ name: 'local', workspace_id: ws.id, parent_id: root.id })

    expect(environmentsRepo.findChain(child.id).map((e) => e.id)).toEqual([root.id, child.id])
    expect(environmentsRepo.findChain(root.id).map((e) => e.id)).toEqual([root.id])
  })

  it('rejects self-parent', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = environmentsRepo.create({ name: 'A', workspace_id: ws.id })
    expect(() => environmentsRepo.update(env.id, { parent_id: env.id })).toThrow(/own parent/i)
  })

  it('rejects parent in a different workspace', () => {
    const wsA = workspacesRepo.create({ name: 'A' })
    const wsB = workspacesRepo.create({ name: 'B' })
    const root = environmentsRepo.create({ name: 'Root', workspace_id: wsA.id })
    expect(() =>
      environmentsRepo.create({ name: 'child', workspace_id: wsB.id, parent_id: root.id }),
    ).toThrow(/same workspace/i)
  })

  it('rejects 3-level chains: child cannot become a parent', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const root = environmentsRepo.create({ name: 'Root', workspace_id: ws.id })
    const mid = environmentsRepo.create({ name: 'Mid', workspace_id: ws.id, parent_id: root.id })
    expect(() =>
      environmentsRepo.create({ name: 'leaf', workspace_id: ws.id, parent_id: mid.id }),
    ).toThrow(/max depth|already a child/i)
  })

  it('rejects re-parenting an env that already has children', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const rootA = environmentsRepo.create({ name: 'A', workspace_id: ws.id })
    const rootB = environmentsRepo.create({ name: 'B', workspace_id: ws.id })
    environmentsRepo.create({ name: 'child', workspace_id: ws.id, parent_id: rootA.id })
    expect(() => environmentsRepo.update(rootA.id, { parent_id: rootB.id })).toThrow(/has children/i)
  })

  it('orphans children when parent is deleted (SET NULL)', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const root = environmentsRepo.create({ name: 'Root', workspace_id: ws.id })
    const child = environmentsRepo.create({ name: 'child', workspace_id: ws.id, parent_id: root.id })

    environmentsRepo.remove(root.id)

    const stillThere = environmentsRepo.findById(child.id)
    expect(stillThere).toBeDefined()
    expect(stillThere!.parent_id).toBeNull()
  })

  it('scopes order to siblings (children of the same parent)', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const root = environmentsRepo.create({ name: 'Root', workspace_id: ws.id })
    const c1 = environmentsRepo.create({ name: 'c1', workspace_id: ws.id, parent_id: root.id })
    const c2 = environmentsRepo.create({ name: 'c2', workspace_id: ws.id, parent_id: root.id })

    expect(c1.order).toBe(1)
    expect(c2.order).toBe(2)
  })
})

describe('variable resolution — parent/child merge', () => {
  it('child overrides parent on shared keys; parent-only keys still resolve', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const parent = environmentsRepo.create({
      name: 'Myapp',
      workspace_id: ws.id,
      variables: JSON.stringify([
        { key: 'apiBase', value: 'https://api.myapp.com', enabled: true },
        { key: 'sharedSecret', value: 'parent-secret', enabled: true },
      ]),
    })
    const child = environmentsRepo.create({
      name: 'local',
      workspace_id: ws.id,
      parent_id: parent.id,
      variables: JSON.stringify([
        { key: 'apiBase', value: 'http://localhost:3000', enabled: true },
        { key: 'localOnly', value: 'yes', enabled: true },
      ]),
    })
    environmentsRepo.activate(child.id, ws.id)

    const vars = getResolvedVariables(ws.id)
    expect(vars.apiBase).toBe('http://localhost:3000') // child wins
    expect(vars.sharedSecret).toBe('parent-secret')    // inherited
    expect(vars.localOnly).toBe('yes')                 // child-only
  })

  it('disabled child entry is ignored — parent value still applies (Option A)', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const parent = environmentsRepo.create({
      name: 'P',
      workspace_id: ws.id,
      variables: JSON.stringify([{ key: 'token', value: 'parent-token', enabled: true }]),
    })
    const child = environmentsRepo.create({
      name: 'C',
      workspace_id: ws.id,
      parent_id: parent.id,
      variables: JSON.stringify([{ key: 'token', value: 'child-token', enabled: false }]),
    })
    environmentsRepo.activate(child.id, ws.id)

    const vars = getResolvedVariables(ws.id)
    expect(vars.token).toBe('parent-token')
  })

  it('substitute() resolves inherited keys in templates', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const parent = environmentsRepo.create({
      name: 'P',
      workspace_id: ws.id,
      variables: JSON.stringify([{ key: 'host', value: 'api.com', enabled: true }]),
    })
    const child = environmentsRepo.create({
      name: 'C',
      workspace_id: ws.id,
      parent_id: parent.id,
      variables: JSON.stringify([{ key: 'path', value: '/v1', enabled: true }]),
    })
    environmentsRepo.activate(child.id, ws.id)

    expect(substitute('https://{{host}}{{path}}', ws.id)).toBe('https://api.com/v1')
  })

  it('collection variables override both parent and child', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const parent = environmentsRepo.create({
      name: 'P',
      workspace_id: ws.id,
      variables: JSON.stringify([{ key: 'k', value: 'from-parent', enabled: true }]),
    })
    const child = environmentsRepo.create({
      name: 'C',
      workspace_id: ws.id,
      parent_id: parent.id,
      variables: JSON.stringify([{ key: 'k', value: 'from-child', enabled: true }]),
    })
    environmentsRepo.activate(child.id, ws.id)

    const col = collectionsRepo.create({ name: 'Col', workspace_id: ws.id })
    collectionsRepo.update(col.id, { variables: JSON.stringify({ k: 'from-collection' }) })

    const vars = getResolvedVariables(ws.id, col.id)
    expect(vars.k).toBe('from-collection')
  })

  it('activating the parent directly resolves only parent vars (no merge with siblings)', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const parent = environmentsRepo.create({
      name: 'P',
      workspace_id: ws.id,
      variables: JSON.stringify([{ key: 'k', value: 'p', enabled: true }]),
    })
    environmentsRepo.create({
      name: 'C',
      workspace_id: ws.id,
      parent_id: parent.id,
      variables: JSON.stringify([{ key: 'k', value: 'c', enabled: true }]),
    })
    environmentsRepo.activate(parent.id, ws.id)

    expect(getResolvedVariables(ws.id).k).toBe('p')
  })
})
