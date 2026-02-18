import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { generateCode } from '../services/code-generator'
import type { CodeLanguage, CodeGenRequest } from '../services/code-generator'

export function registerCodeGeneratorHandlers(): void {
  ipcMain.handle(
    IPC.CODE_GENERATE,
    (_event, language: CodeLanguage, data: CodeGenRequest, workspaceId?: string, collectionId?: string): string => {
      return generateCode(language, data, workspaceId, collectionId)
    },
  )
}
