import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'
import { IPC } from '../../shared/types/ipc'
import * as dataService from '../services/data-export-import'
import { importPostman } from '../services/postman-import'

const MAX_IMPORT_SIZE = 50 * 1024 * 1024 // 50 MB

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

  ipcMain.handle(IPC.DATA_EXPORT_COLLECTION, async (_event, collectionId: string) => {
    return dataService.exportSingleCollection(collectionId)
  })

  ipcMain.handle(IPC.DATA_PICK_AND_READ, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const content = readFileSync(filePath, 'utf-8')
    const name = filePath.split(/[\\/]/).pop() ?? 'import.json'
    return { content, name }
  })

  ipcMain.handle(IPC.DATA_IMPORT, async (_event, json: string, workspaceId?: string) => {
    if (typeof json !== 'string' || json.length > MAX_IMPORT_SIZE) {
      throw new Error(`Import data too large (max ${MAX_IMPORT_SIZE / 1024 / 1024}MB)`)
    }
    return dataService.importData(json, workspaceId)
  })

  ipcMain.handle(IPC.POSTMAN_IMPORT, async (_event, json: string, workspaceId?: string) => {
    if (typeof json !== 'string' || json.length > MAX_IMPORT_SIZE) {
      throw new Error(`Import data too large (max ${MAX_IMPORT_SIZE / 1024 / 1024}MB)`)
    }
    return importPostman(json, workspaceId)
  })
}
