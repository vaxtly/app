import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { listAll, clearAll, deleteCookie } from '../services/cookie-jar'
import type { StoredCookie } from '../../shared/types/cookies'

export function registerCookieHandlers(): void {
  ipcMain.handle(IPC.COOKIES_LIST, (): StoredCookie[] => {
    return listAll()
  })

  ipcMain.handle(IPC.COOKIES_CLEAR, () => {
    clearAll()
  })

  ipcMain.handle(IPC.COOKIES_DELETE, (_event, domain: string, name: string) => {
    deleteCookie(domain, name)
  })
}
