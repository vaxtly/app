import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('splashApi', {
  onStatus: (callback: (text: string) => void): void => {
    ipcRenderer.on('splash:status', (_event, text: string) => callback(text))
  }
})
