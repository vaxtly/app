import { ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { IPC } from '../../shared/types/ipc'
import * as dataService from '../services/data-export-import'
import { importPostman } from '../services/postman-import'

export function registerDataImportExportHandlers(): void {
  ipcMain.handle(
    IPC.DATA_EXPORT,
    async (_event, type: 'all' | 'collections' | 'environments' | 'config', workspaceId?: string) => {
      switch (type) {
        case 'all':
          return dataService.exportAll(workspaceId)
        case 'collections':
          return dataService.exportCollections(workspaceId)
        case 'environments':
          return dataService.exportEnvironments(workspaceId)
        case 'config':
          return dataService.exportConfig()
        default:
          throw new Error(`Unknown export type: ${type}`)
      }
    },
  )

  ipcMain.handle(IPC.DATA_READ_FILE, async (_event, filePath: string) => {
    return readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle(IPC.DATA_IMPORT, async (_event, json: string, workspaceId?: string) => {
    return dataService.importData(json, workspaceId)
  })

  ipcMain.handle(IPC.POSTMAN_IMPORT, async (_event, json: string, workspaceId?: string) => {
    return importPostman(json, workspaceId)
  })
}
