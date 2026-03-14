import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { subscribe, unsubscribe } from '../services/graphql-subscription'

export function registerGraphqlSubscriptionHandlers(): void {
  ipcMain.handle(
    IPC.GQL_SUB_SUBSCRIBE,
    (event, requestId: string, config: {
      url: string
      query: string
      variables?: Record<string, unknown>
      headers?: Record<string, string>
      workspaceId?: string
      collectionId?: string
    }) => {
      subscribe(requestId, config, {
        onStatusChanged: (data) => event.sender.send(IPC.GQL_SUB_STATUS_CHANGED, data),
        onEvent: (data) => event.sender.send(IPC.GQL_SUB_EVENT, data),
      })
    },
  )

  ipcMain.handle(IPC.GQL_SUB_UNSUBSCRIBE, (_event, requestId: string) => {
    unsubscribe(requestId)
  })
}
