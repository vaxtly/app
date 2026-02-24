/**
 * OAuth 2.0 IPC handlers — token acquisition, refresh, and clearing.
 */

import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import type { AuthConfig } from '../../shared/types/models'
import * as requestsRepo from '../database/repositories/requests'
import {
  startAuthorizationFlow,
  exchangeAuthorizationCode,
  exchangeClientCredentials,
  exchangePassword,
  refreshAccessToken,
  type TokenResponse,
} from '../services/oauth2'
import { logHttp } from '../services/session-log'

export function registerOAuth2Handlers(): void {
  /**
   * Get a new token for the given request using the configured grant type.
   * Returns the updated auth config with tokens populated.
   */
  ipcMain.handle(IPC.OAUTH2_GET_TOKEN, async (_event, requestId: string): Promise<AuthConfig> => {
    const request = requestsRepo.findById(requestId)
    if (!request?.auth) throw new Error('Request not found or has no auth config')

    const auth = JSON.parse(request.auth) as AuthConfig
    if (auth.type !== 'oauth2') throw new Error('Request is not configured for OAuth 2.0')

    let tokenResponse: TokenResponse

    switch (auth.oauth2_grant_type) {
      case 'authorization_code': {
        const { code, codeVerifier } = await startAuthorizationFlow(auth)
        tokenResponse = await exchangeAuthorizationCode(auth, code, codeVerifier)
        break
      }
      case 'client_credentials': {
        tokenResponse = await exchangeClientCredentials(auth)
        break
      }
      case 'password': {
        tokenResponse = await exchangePassword(auth)
        break
      }
      default:
        throw new Error(`Unsupported grant type: ${auth.oauth2_grant_type}`)
    }

    const updatedAuth: AuthConfig = { ...auth, ...tokenResponse }
    requestsRepo.update(requestId, { auth: JSON.stringify(updatedAuth) })
    logHttp('oauth2', auth.oauth2_access_token_url ?? '', `Token obtained (${auth.oauth2_grant_type})`)

    // Re-read to get decrypted values
    const saved = requestsRepo.findById(requestId)
    return saved?.auth ? JSON.parse(saved.auth) : updatedAuth
  })

  /**
   * Manually refresh the access token for a request.
   */
  ipcMain.handle(IPC.OAUTH2_REFRESH_TOKEN, async (_event, requestId: string): Promise<AuthConfig> => {
    const request = requestsRepo.findById(requestId)
    if (!request?.auth) throw new Error('Request not found or has no auth config')

    const auth = JSON.parse(request.auth) as AuthConfig
    if (auth.type !== 'oauth2') throw new Error('Request is not configured for OAuth 2.0')

    const tokenResponse = await refreshAccessToken(auth)
    const updatedAuth: AuthConfig = { ...auth, ...tokenResponse }
    requestsRepo.update(requestId, { auth: JSON.stringify(updatedAuth) })
    logHttp('oauth2', auth.oauth2_access_token_url ?? '', 'Token refreshed')

    const saved = requestsRepo.findById(requestId)
    return saved?.auth ? JSON.parse(saved.auth) : updatedAuth
  })

  /**
   * Clear stored tokens for a request.
   */
  ipcMain.handle(IPC.OAUTH2_CLEAR_TOKEN, async (_event, requestId: string): Promise<AuthConfig> => {
    const request = requestsRepo.findById(requestId)
    if (!request?.auth) throw new Error('Request not found or has no auth config')

    const auth = JSON.parse(request.auth) as AuthConfig
    const cleared: AuthConfig = {
      ...auth,
      oauth2_access_token: undefined,
      oauth2_refresh_token: undefined,
      oauth2_token_type: undefined,
      oauth2_expires_at: undefined,
    }

    requestsRepo.update(requestId, { auth: JSON.stringify(cleared) })
    logHttp('oauth2', '', 'Tokens cleared')
    return cleared
  })
}
