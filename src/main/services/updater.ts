import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../../shared/types/ipc'

function pushToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

function isScoopInstall(): boolean {
  if (process.platform !== 'win32') return false
  return app.getPath('exe').toLowerCase().includes('scoop\\apps')
}

export function getInstallSource(): 'brew' | 'scoop' | 'standalone' {
  if (process.platform === 'darwin') return 'brew'
  if (isScoopInstall()) return 'scoop'
  return 'standalone'
}

export function initUpdater(): void {
  if (!app.isPackaged) return

  const isPackageManaged = getInstallSource() !== 'standalone'
  autoUpdater.autoDownload = !isPackageManaged
  autoUpdater.autoInstallOnAppQuit = !isPackageManaged

  autoUpdater.on('update-available', (info) => {
    pushToAllWindows(IPC.UPDATE_AVAILABLE, {
      version: info.version,
      releaseName: info.releaseName ?? `v${info.version}`,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    pushToAllWindows(IPC.UPDATE_PROGRESS, { percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    pushToAllWindows(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    pushToAllWindows(IPC.UPDATE_ERROR, err.message)
  })
}

export function checkForUpdates(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates()
}

export function quitAndInstall(): void {
  if (getInstallSource() !== 'standalone') return
  autoUpdater.quitAndInstall()
}
