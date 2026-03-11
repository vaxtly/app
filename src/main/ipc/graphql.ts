import { ipcMain } from 'electron'
import { fetch as undiciFetch } from 'undici'
import { IPC } from '../../shared/types/ipc'
import { substitute } from '../services/variable-substitution'
import { getIntrospectionQuery } from 'graphql'
import * as settingsRepo from '../database/repositories/settings'
import { createUndiciDispatcher } from '../services/tls-options'
import * as environmentsRepo from '../database/repositories/environments'
import * as vaultSyncService from '../vault/vault-sync-service'

interface IntrospectConfig {
  url: string
  headers?: Record<string, string>
  workspaceId?: string
  collectionId?: string
}

export function registerGraphqlHandlers(): void {
  ipcMain.handle(IPC.GRAPHQL_INTROSPECT, async (_event, config: IntrospectConfig) => {
    const sub = (text: string): string =>
      substitute(text, config.workspaceId, config.collectionId)

    // Ensure vault secrets are in-memory before substitution
    if (config.workspaceId) {
      const activeEnv = environmentsRepo.findActive(config.workspaceId)
      if (activeEnv?.vault_synced === 1) {
        try {
          await vaultSyncService.ensureLoaded(activeEnv.id, config.workspaceId)
        } catch { /* non-blocking */ }
      }
    }

    const resolvedUrl = sub(config.url)
    const resolvedHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        resolvedHeaders[sub(key)] = sub(value)
      }
    }

    const verifySsl = settingsRepo.getSetting('request.verify_ssl') !== 'false'
    const dispatcher = createUndiciDispatcher(verifySsl, resolvedUrl)

    const body = JSON.stringify({ query: getIntrospectionQuery() })

    const response = await undiciFetch(resolvedUrl, {
      method: 'POST',
      headers: resolvedHeaders,
      body,
      dispatcher,
    } as any)

    if (!response.ok) {
      throw new Error(`Introspection failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json() as { data?: unknown; errors?: Array<{ message: string }> }
    if (result.errors?.length) {
      throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`)
    }
    if (!result.data) {
      throw new Error('Introspection response missing data')
    }

    return result.data
  })
}
