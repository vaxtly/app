<script lang="ts">
  import { appStore } from '../../lib/stores/app.svelte'
  import { collectionsStore } from '../../lib/stores/collections.svelte'
  import { environmentsStore } from '../../lib/stores/environments.svelte'

  type ExportType = 'all' | 'collections' | 'environments' | 'config'

  let exportType = $state<ExportType>('all')
  let exporting = $state(false)
  let importing = $state(false)
  let status = $state<{ type: 'success' | 'error'; message: string } | null>(null)

  const exportOptions: { key: ExportType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'collections', label: 'Collections' },
    { key: 'environments', label: 'Environments' },
    { key: 'config', label: 'Config' },
  ]

  async function handleExport(): Promise<void> {
    exporting = true
    status = null
    try {
      const data = await window.api.data.export(exportType, appStore.activeWorkspaceId ?? undefined)
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vaxtly-export-${exportType}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      status = { type: 'success', message: 'Export complete' }
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Export failed' }
    } finally {
      exporting = false
    }
  }

  async function handleImport(): Promise<void> {
    importing = true
    status = null
    try {
      const fileResult = await window.api.proxy.pickFile()
      if (!fileResult) {
        importing = false
        return
      }

      // Read file content via fetch (Electron file:// protocol)
      const response = await fetch(`file://${fileResult.path}`)
      const json = await response.text()

      // Detect format: Postman or Vaxtly
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(json)
      } catch {
        status = { type: 'error', message: 'Invalid JSON file' }
        importing = false
        return
      }

      if (parsed.info && typeof parsed.info === 'object' && '_postman_id' in (parsed.info as object)) {
        // Postman format
        const result = await window.api.data.importPostman(json, appStore.activeWorkspaceId ?? undefined)
        status = {
          type: result.errors.length > 0 ? 'error' : 'success',
          message: `Imported ${result.collectionsCreated} collections, ${result.requestsCreated} requests${result.errors.length > 0 ? `. Errors: ${result.errors.join(', ')}` : ''}`,
        }
      } else {
        // Vaxtly format
        const result = await window.api.data.import(json, appStore.activeWorkspaceId ?? undefined)
        status = {
          type: result.errors.length > 0 ? 'error' : 'success',
          message: `Imported ${result.collections} collections, ${result.environments} environments${result.errors.length > 0 ? `. Errors: ${result.errors.join(', ')}` : ''}`,
        }
      }

      // Reload data
      await collectionsStore.loadAll(appStore.activeWorkspaceId ?? undefined)
      await environmentsStore.loadAll(appStore.activeWorkspaceId ?? undefined)
    } catch (err) {
      status = { type: 'error', message: err instanceof Error ? err.message : 'Import failed' }
    } finally {
      importing = false
    }
  }
</script>

<div class="space-y-6">
  {#if status}
    <div class="rounded border px-3 py-2 text-xs {status.type === 'success'
      ? 'border-green-800 bg-green-900/30 text-green-300'
      : 'border-red-800 bg-red-900/30 text-red-300'}">
      {status.message}
    </div>
  {/if}

  <!-- Export section -->
  <div>
    <div class="mb-3 text-sm font-medium text-surface-200">Export</div>

    <!-- Type pills -->
    <div class="mb-3 flex gap-1">
      {#each exportOptions as opt}
        <button
          onclick={() => { exportType = opt.key }}
          class="rounded-full px-3 py-1 text-xs transition-colors {exportType === opt.key
            ? 'bg-brand-600 text-white'
            : 'bg-surface-800 text-surface-400 hover:text-surface-200'}"
        >
          {opt.label}
        </button>
      {/each}
    </div>

    <button
      onclick={handleExport}
      disabled={exporting}
      class="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
    >
      {exporting ? 'Exporting...' : 'Export'}
    </button>
  </div>

  <div class="border-t border-surface-700"></div>

  <!-- Import section -->
  <div>
    <div class="mb-2 text-sm font-medium text-surface-200">Import</div>
    <div class="mb-3 text-xs text-surface-500">
      Supports Vaxtly JSON exports and Postman Collection v2.1 format. Format is detected automatically.
    </div>

    <button
      onclick={handleImport}
      disabled={importing}
      class="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
    >
      {importing ? 'Importing...' : 'Choose File & Import'}
    </button>
  </div>
</div>
