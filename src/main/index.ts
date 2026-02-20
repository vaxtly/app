import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initEncryption } from './services/encryption'
import { openDatabase, closeDatabase, getDatabase } from './database/connection'
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
import { registerUpdaterHandlers } from './ipc/updater'
import { initUpdater, checkForUpdates } from './services/updater'
import * as workspacesRepo from './database/repositories/workspaces'
import * as historiesRepo from './database/repositories/request-histories'
import { getSetting, setSetting } from './database/repositories/settings'
import { DEFAULTS } from '../shared/constants'
import { encryptValue } from './services/encryption'
import * as vaultSyncService from './vault/vault-sync-service'
import * as remoteSyncService from './sync/remote-sync-service'
import { logVault, logSync } from './services/session-log'

let mainWindow: BrowserWindow | null = null

function getAppIcon(): Electron.NativeImage {
  const iconsDir = app.isPackaged
    ? join(process.resourcesPath, 'icons')
    : join(__dirname, '../../build/icons')
  const sizes = [16, 32, 48, 64, 128, 256, 512]
  const image = nativeImage.createEmpty()
  for (const size of sizes) {
    const sizePath = join(iconsDir, `${size}x${size}.png`)
    try {
      const sizeImage = nativeImage.createFromPath(sizePath)
      if (!sizeImage.isEmpty()) {
        image.addRepresentation({ width: size, height: size, buffer: sizeImage.toPNG() })
      }
    } catch {
      // skip missing sizes
    }
  }
  // Fallback to single icon.png if no sized icons found
  if (image.isEmpty()) {
    const fallback = app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '../../build/icon.png')
    return nativeImage.createFromPath(fallback)
  }
  return image
}

function applyThemeSetting(): string {
  const theme = getSetting('app.theme') ?? 'dark'
  if (theme === 'light') {
    nativeTheme.themeSource = 'light'
    return '#ffffff'
  } else if (theme === 'system') {
    nativeTheme.themeSource = 'system'
    return nativeTheme.shouldUseDarkColors ? '#0f172a' : '#ffffff'
  } else {
    nativeTheme.themeSource = 'dark'
    return '#0f172a'
  }
}

function createWindow(): void {
  const state = getWindowState()
  const backgroundColor = applyThemeSetting()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    minWidth: 800,
    minHeight: 600,
    ...(process.platform !== 'darwin'
      ? { icon: getAppIcon() }
      : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor,
  })

  if (state.is_maximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    runAutoSync()
    checkForUpdates()
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

  // Block all navigation away from the app
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // Block all new window requests
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  // Deny all permission requests (camera, mic, geolocation, etc.)
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(false)
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
  registerUpdaterHandlers()
}

function ensureDefaultWorkspace(): void {
  const workspaces = workspacesRepo.findAll()
  if (workspaces.length === 0) {
    workspacesRepo.create({ name: 'Default Workspace' })
  }
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

async function runAutoSync(): Promise<void> {
  // Resolve effective auto_sync per workspace (workspace setting → global fallback).
  // This mirrors how getProvider() resolves credentials, so the pull uses the same
  // config that the auto_sync toggle controls.
  const workspaces = workspacesRepo.findAll()

  for (const ws of workspaces) {
    const vaultAuto = workspacesRepo.getWorkspaceSetting(ws.id, 'vault.auto_sync') ?? getSetting('vault.auto_sync')
    if (isEnabled(vaultAuto)) {
      logVault('auto-sync', ws.name, 'Starting vault auto-sync...')
      try {
        const result = await vaultSyncService.pullAll(ws.id)
        if (result.errors.length > 0) {
          logVault('auto-sync', ws.name, `Completed with errors: ${result.errors.join('; ')}`, false)
        } else {
          logVault('auto-sync', ws.name, `Pulled ${result.created} new environment(s)`)
        }
      } catch (e) {
        logVault('auto-sync', ws.name, `Failed: ${e instanceof Error ? e.message : String(e)}`, false)
      }
    }

    const syncAuto = workspacesRepo.getWorkspaceSetting(ws.id, 'sync.auto_sync') ?? getSetting('sync.auto_sync')
    if (isEnabled(syncAuto)) {
      logSync('auto-sync', ws.name, 'Starting git auto-sync...')
      try {
        const result = await remoteSyncService.pull(ws.id)
        logSync('auto-sync', ws.name, result.message ?? `Pulled ${result.pulled ?? 0} collection(s)`, result.success)
      } catch (e) {
        logSync('auto-sync', ws.name, `Failed: ${e instanceof Error ? e.message : String(e)}`, false)
      }
    }
  }
}

/**
 * One-time migration: encrypt existing plaintext sensitive data.
 * After migration, all sensitive fields are stored encrypted in the DB.
 */
function migrateToEncryptedStorage(): void {
  const db = getDatabase()
  const marker = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('encryption.migrated') as { value: string } | undefined
  if (marker?.value === '1') return

  const SENSITIVE_SETTINGS = ['vault.token', 'vault.role_id', 'vault.secret_id', 'sync.token']

  // Re-write sensitive settings through the encrypt layer
  // getSetting now decrypts, setSetting now encrypts — for plaintext values,
  // getSetting returns them as-is (try/catch fallback), then setSetting encrypts them
  for (const key of SENSITIVE_SETTINGS) {
    const value = getSetting(key)
    if (value) {
      setSetting(key, value)
    }
  }

  // Re-write environment variable values
  const envRows = db.prepare('SELECT id, variables FROM environments').all() as { id: string; variables: string }[]
  for (const row of envRows) {
    if (!row.variables || row.variables === '[]') continue
    try {
      const vars = JSON.parse(row.variables) as { key: string; value: string; enabled: boolean }[]
      let changed = false
      const encrypted = vars.map((v) => {
        if (v.value && !v.value.startsWith('enc:')) {
          changed = true
          return { ...v, value: 'enc:' + encryptValue(v.value) }
        }
        return v
      })
      if (changed) {
        db.prepare('UPDATE environments SET variables = ? WHERE id = ?').run(JSON.stringify(encrypted), row.id)
      }
    } catch {
      // skip unparseable rows
    }
  }

  // Re-write request auth credentials
  const AUTH_FIELDS = ['bearer_token', 'basic_username', 'basic_password', 'api_key_value']
  const reqRows = db.prepare('SELECT id, auth FROM requests WHERE auth IS NOT NULL').all() as { id: string; auth: string }[]
  for (const row of reqRows) {
    try {
      const auth = JSON.parse(row.auth)
      let changed = false
      for (const field of AUTH_FIELDS) {
        if (auth[field] && !auth[field].startsWith('enc:')) {
          auth[field] = 'enc:' + encryptValue(auth[field])
          changed = true
        }
      }
      if (changed) {
        db.prepare('UPDATE requests SET auth = ? WHERE id = ?').run(JSON.stringify(auth), row.id)
      }
    } catch {
      // skip unparseable rows
    }
  }

  // Mark migration as complete
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES ('encryption.migrated', '1')
    ON CONFLICT(key) DO UPDATE SET value = '1'
  `).run()
}

if (!app.isPackaged && process.env.VAXTLY_TEST_USERDATA) {
  app.setPath('userData', process.env.VAXTLY_TEST_USERDATA)
}

app.whenReady().then(() => {
  // Initialize encryption (master key for future SQLCipher)
  initEncryption()

  // Open database and run migrations
  const dbPath = join(app.getPath('userData'), 'vaxtly.db')
  openDatabase(dbPath)

  // Migrate existing plaintext data to encrypted storage
  migrateToEncryptedStorage()

  // Ensure at least one workspace exists
  ensureDefaultWorkspace()

  // Register IPC handlers
  registerAllIpcHandlers()

  // Prune old request histories
  const retentionDays = parseInt(getSetting('history.retention_days') ?? '', 10) || DEFAULTS.HISTORY_RETENTION_DAYS
  historiesRepo.prune(retentionDays)

  // Build native menu
  buildMenu()

  // Persist current app version so the renderer can read it
  setSetting('app.version', app.getVersion())

  // Initialize auto-updater
  initUpdater()

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
