/**
 * Environments store — list and active environment tracking.
 */

import type { Environment } from '../../lib/types'

// --- State ---

let environments = $state<Environment[]>([])
let activeEnvironmentId = $state<string | null>(null)
let vaultHealthy = $state<boolean | null>(null) // null = not vault-synced or not checked

// --- Derived ---

const activeEnvironment = $derived(environments.find((e) => e.id === activeEnvironmentId) ?? null)

// --- Actions ---

async function loadAll(workspaceId?: string): Promise<void> {
  environments = await window.api.environments.list(workspaceId)
  const active = environments.find((e) => e.is_active === 1)
  activeEnvironmentId = active?.id ?? null

  // Pre-fetch vault secrets for active vault-synced environment on startup
  if (active?.vault_synced === 1) {
    const result = await window.api.environments.activate(active.id, workspaceId)
    vaultHealthy = result ? !result.vaultFailed : null
  } else {
    vaultHealthy = null
  }
}

async function create(name: string, workspaceId?: string): Promise<Environment> {
  const env = await window.api.environments.create({ name, workspace_id: workspaceId })
  // Append locally so the UI updates immediately (consistent with remove's local filter)
  environments = [...environments, env]
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
    vaultHealthy = null
  }
}

async function activate(id: string, workspaceId?: string): Promise<void> {
  const result = await window.api.environments.activate(id, workspaceId)
  environments = environments.map((e) => ({
    ...e,
    is_active: e.id === id ? 1 : 0,
  }))
  activeEnvironmentId = id

  const env = environments.find((e) => e.id === id)
  if (env?.vault_synced === 1) {
    vaultHealthy = result ? !result.vaultFailed : null
  } else {
    vaultHealthy = null
  }
}

async function deactivate(id: string): Promise<void> {
  await window.api.environments.deactivate(id)
  environments = environments.map((e) => ({
    ...e,
    is_active: e.id === id ? 0 : e.is_active,
  }))
  if (activeEnvironmentId === id) {
    activeEnvironmentId = null
    vaultHealthy = null
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
  get vaultHealthy() { return vaultHealthy },

  loadAll,
  create,
  update,
  remove,
  activate,
  deactivate,
  getById,
}
