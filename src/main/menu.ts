import { Menu, BrowserWindow, app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/types/ipc'

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  function sendToFocused(channel: string): void {
    const win = BrowserWindow.getFocusedWindow()
    win?.webContents.send(channel)
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Request',
          accelerator: 'CmdOrCtrl+N',
          click: (): void => sendToFocused(IPC.MENU_NEW_REQUEST),
        },
        {
          label: 'Save Request',
          accelerator: 'CmdOrCtrl+S',
          click: (): void => sendToFocused(IPC.MENU_SAVE_REQUEST),
        },
        { type: 'separator' },
        {
          label: 'Send Request',
          accelerator: 'CmdOrCtrl+Return',
          click: (): void => sendToFocused('menu:send-request'),
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (): void => sendToFocused('menu:close-tab'),
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: (): void => sendToFocused(IPC.MENU_OPEN_SETTINGS),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: (): void => sendToFocused('menu:toggle-sidebar'),
        },
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: 'Ctrl+PageDown',
          click: (): void => sendToFocused('menu:next-tab'),
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+PageUp',
          click: (): void => sendToFocused('menu:prev-tab'),
        },
        ...(is.dev
          ? [
              { type: 'separator' as const },
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ]
          : [{ type: 'separator' as const }]),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'User Manual',
          accelerator: 'F1',
          click: (): void => sendToFocused(IPC.MENU_OPEN_MANUAL),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: (): void => sendToFocused(IPC.MENU_CHECK_UPDATES),
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
