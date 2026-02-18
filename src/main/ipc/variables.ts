import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { getResolvedVariables, getResolvedVariablesWithSource } from '../services/variable-substitution'

export function registerVariableHandlers(): void {
  ipcMain.handle(
    IPC.VARIABLES_RESOLVE,
    (_event, workspaceId?: string, collectionId?: string) => {
      return getResolvedVariables(workspaceId, collectionId)
    },
  )

  ipcMain.handle(
    IPC.VARIABLES_RESOLVE_WITH_SOURCE,
    (_event, workspaceId?: string, collectionId?: string) => {
      return getResolvedVariablesWithSource(workspaceId, collectionId)
    },
  )
}
