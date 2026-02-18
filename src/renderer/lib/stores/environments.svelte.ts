/**
 * Environments store — list and active environment tracking.
 */

import type { Environment } from '../../lib/types'

// --- State ---

let environments = $state<Environment[]>([])
let activeEnvironmentId = $state<string | null>(null)

// --- Derived ---

const activeEnvironment = $derived(environments.find((e) => e.id === activeEnvironmentId) ?? null)

// --- Actions ---

async function loadAll(workspaceId?: string): Promise<void> {
  environments = await window.api.environments.list(workspaceId)
  const active = environments.find((e) => e.is_active === 1)
  activeEnvironmentId = active?.id ?? null
}

async function create(name: string, workspaceId?: string): Promise<Environment> {
  const env = await window.api.environments.create({ name, workspace_id: workspaceId })
  await loadAll(workspaceId)
  return env
}

async function update(id: string, data: Partial<Environment>): Promise<void> {
  await window.api.environments.update(id, data)
  environments = environments.map((e) => (e.id === id ? { ...e, ...data } : e))
}

async function remove(id: string): Promise<void> {
  await window.api.environments.delete(id)
  environments = environments.filter((e) => e.id !== id)
  if (activeEnvironmentId === id) {
    activeEnvironmentId = null
  }
}

async function activate(id: string, workspaceId?: string): Promise<void> {
  await window.api.environments.activate(id, workspaceId)
  environments = environments.map((e) => ({
    ...e,
    is_active: e.id === id ? 1 : 0,
  }))
  activeEnvironmentId = id
}

async function deactivate(id: string): Promise<void> {
  await window.api.environments.deactivate(id)
  environments = environments.map((e) => ({
    ...e,
    is_active: e.id === id ? 0 : e.is_active,
  }))
  if (activeEnvironmentId === id) {
    activeEnvironmentId = null
  }
}

function getById(id: string): Environment | undefined {
  return environments.find((e) => e.id === id)
}

// --- Export ---

export const environmentsStore = {
  get environments() { return environments },
  get activeEnvironmentId() { return activeEnvironmentId },
  get activeEnvironment() { return activeEnvironment },

  loadAll,
  create,
  update,
  remove,
  activate,
  deactivate,
  getById,
}
