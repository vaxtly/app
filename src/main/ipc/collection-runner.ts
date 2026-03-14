import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { startRun, cancelRun } from '../services/collection-runner'
import type { CollectionRunResult } from '../../shared/types/runner'

export function registerCollectionRunnerHandlers(): void {
  ipcMain.handle(
    IPC.RUNNER_START,
    async (event, collectionId: string, workspaceId?: string): Promise<CollectionRunResult> => {
      return startRun(collectionId, workspaceId, {
        onStarted: (data) => event.sender.send(IPC.RUNNER_STARTED, data),
        onProgress: (data) => event.sender.send(IPC.RUNNER_PROGRESS, data),
        onComplete: (data) => event.sender.send(IPC.RUNNER_COMPLETE, data),
      })
    },
  )

  ipcMain.handle(IPC.RUNNER_CANCEL, (_event, runId: string) => {
    cancelRun(runId)
  })
}
