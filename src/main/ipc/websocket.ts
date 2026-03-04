import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as wsClient from '../services/websocket-client'
import * as wsMessagesRepo from '../database/repositories/websocket-messages'
import type { WsConnectionConfig } from '../../shared/types/websocket'

export function registerWebSocketHandlers(): void {
  ipcMain.handle(IPC.WS_CONNECT, async (_event, connectionId: string, config: WsConnectionConfig) => {
    return await wsClient.connect(connectionId, config)
  })

  ipcMain.handle(IPC.WS_DISCONNECT, async (_event, connectionId: string) => {
    await wsClient.disconnect(connectionId)
  })

  ipcMain.handle(IPC.WS_SEND, (_event, connectionId: string, data: string) => {
    return wsClient.sendMessage(connectionId, data)
  })

  ipcMain.handle(IPC.WS_MESSAGES_LIST, (_event, connectionId: string) => {
    return wsMessagesRepo.findByConnection(connectionId)
  })

  ipcMain.handle(IPC.WS_MESSAGES_CLEAR, (_event, connectionId: string) => {
    wsMessagesRepo.clearByConnection(connectionId)
  })
}
