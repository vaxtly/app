import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initEncryption } from './services/encryption'
import { openDatabase, closeDatabase } from './database/connection'
import { getWindowState, saveWindowState } from './database/repositories/settings'
import { buildMenu } from './menu'
import { registerWorkspaceHandlers } from './ipc/workspaces'
import { registerCollectionHandlers } from './ipc/collections'
import { registerFolderHandlers } from './ipc/folders'
import { registerRequestHandlers } from './ipc/requests'
import { registerEnvironmentHandlers } from './ipc/environments'
import { registerProxyHandlers } from './ipc/proxy'
import { registerSyncHandlers } from './ipc/sync'
import { registerVaultHandlers } from './ipc/vault'
import { registerSettingsHandlers } from './ipc/settings'
import { registerVariableHandlers } from './ipc/variables'
import { registerHistoryHandlers } from './ipc/histories'
import { registerSessionLogHandlers } from './ipc/session-log'
import { registerCodeGeneratorHandlers } from './ipc/code-generator'
import { registerDataImportExportHandlers } from './ipc/data-import-export'
import * as workspacesRepo from './database/repositories/workspaces'
import * as historiesRepo from './database/repositories/request-histories'
import { getSetting } from './database/repositories/settings'
import { DEFAULTS } from '../shared/constants'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const state = getWindowState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: '#0f172a',
  })

  if (state.is_maximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        is_maximized: mainWindow.isMaximized() ? 1 : 0,
      })
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerAllIpcHandlers(): void {
  registerWorkspaceHandlers()
  registerCollectionHandlers()
  registerFolderHandlers()
  registerRequestHandlers()
  registerEnvironmentHandlers()
  registerProxyHandlers()
  registerSyncHandlers()
  registerVaultHandlers()
  registerSettingsHandlers()
  registerVariableHandlers()
  registerHistoryHandlers()
  registerSessionLogHandlers()
  registerCodeGeneratorHandlers()
  registerDataImportExportHandlers()
}

function ensureDefaultWorkspace(): void {
  const workspaces = workspacesRepo.findAll()
  if (workspaces.length === 0) {
    workspacesRepo.create({ name: 'Default Workspace' })
  }
}

app.whenReady().then(() => {
  // Initialize encryption (master key for future SQLCipher)
  initEncryption()

  // Open database and run migrations
  const dbPath = join(app.getPath('userData'), 'vaxtly.db')
  openDatabase(dbPath)

  // Ensure at least one workspace exists
  ensureDefaultWorkspace()

  // Register IPC handlers
  registerAllIpcHandlers()

  // Prune old request histories
  const retentionDays = parseInt(getSetting('history_retention_days') ?? '', 10) || DEFAULTS.HISTORY_RETENTION_DAYS
  historiesRepo.prune(retentionDays)

  // Build native menu
  buildMenu()

  // Create the main window
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
