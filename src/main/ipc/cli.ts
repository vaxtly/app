/**
 * "Add `vaxtly` to my PATH" — installs the bundled CLI binary as a symlink
 * into ~/.local/bin so the user can run `vaxtly` from any terminal without
 * knowing the .app's internal path. POSIX only in MVP (macOS + Linux);
 * Windows returns an unsupported-platform status that the renderer surfaces.
 *
 * The bundled CLI lives at `<resourcesPath>/cli/index.js` in production. In
 * dev (electron-vite serving), it lives at `cli/dist/index.js` from the
 * project root. We resolve both, prefer the resources path, fall back to dev.
 */

import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { IPC } from '../../shared/types/ipc'

export type CliPathStatus =
  | { state: 'unsupported'; platform: string }
  | { state: 'missing-bundle'; expectedAt: string }
  | { state: 'not-installed'; bundlePath: string; targetPath: string; pathHasDir: boolean }
  | { state: 'installed'; bundlePath: string; targetPath: string; pathHasDir: boolean }
  | { state: 'installed-elsewhere'; bundlePath: string; targetPath: string; pointsTo: string; pathHasDir: boolean }

export type CliInstallResult =
  | { ok: true; targetPath: string; pathHasDir: boolean; bundlePath: string }
  | { ok: false; error: string; code: 'unsupported' | 'missing-bundle' | 'symlink-failed' | 'occupied' }

const TARGET_DIR = join(homedir(), '.local', 'bin')
const TARGET_PATH = join(TARGET_DIR, 'vaxtly')

function bundledCliPath(): string | undefined {
  // Production: extraResources in electron-builder.yml places cli/dist contents
  // under <resourcesPath>/cli/.
  const packaged = join(process.resourcesPath, 'cli', 'index.js')
  if (existsSync(packaged)) return packaged

  // Dev fallback: cli/dist/index.js relative to the app root. app.getAppPath()
  // in dev returns the project root, in prod returns inside the asar bundle.
  const devCandidate = join(app.getAppPath(), 'cli', 'dist', 'index.js')
  if (existsSync(devCandidate)) return devCandidate

  return undefined
}

function pathHasLocalBin(): boolean {
  const envPath = process.env.PATH ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  return envPath.split(sep).some((entry) => {
    if (!entry) return false
    // Normalize trailing slashes for comparison
    const normalized = entry.replace(/\/$/, '')
    return normalized === TARGET_DIR.replace(/\/$/, '')
  })
}

function readStatus(): CliPathStatus {
  if (process.platform === 'win32') {
    return { state: 'unsupported', platform: 'win32' }
  }

  const bundle = bundledCliPath()
  if (!bundle) {
    return { state: 'missing-bundle', expectedAt: join(process.resourcesPath, 'cli', 'index.js') }
  }

  const pathHasDir = pathHasLocalBin()
  if (!existsSync(TARGET_PATH)) {
    return { state: 'not-installed', bundlePath: bundle, targetPath: TARGET_PATH, pathHasDir }
  }

  try {
    const stat = lstatSync(TARGET_PATH)
    if (stat.isSymbolicLink()) {
      const link = readlinkSync(TARGET_PATH)
      if (link === bundle) {
        return { state: 'installed', bundlePath: bundle, targetPath: TARGET_PATH, pathHasDir }
      }
      return { state: 'installed-elsewhere', bundlePath: bundle, targetPath: TARGET_PATH, pointsTo: link, pathHasDir }
    }
  } catch {
    // ignore — fall through to "not installed"
  }
  return { state: 'not-installed', bundlePath: bundle, targetPath: TARGET_PATH, pathHasDir }
}

function performInstall(): CliInstallResult {
  if (process.platform === 'win32') {
    return { ok: false, error: 'Windows installation is not yet supported. Use the bundled binary directly from the install folder.', code: 'unsupported' }
  }

  const bundle = bundledCliPath()
  if (!bundle) {
    return {
      ok: false,
      code: 'missing-bundle',
      error: `Bundled CLI not found. This build is missing the cli/ folder. Update Vaxtly to v0.11.1 or later.`,
    }
  }

  try {
    mkdirSync(TARGET_DIR, { recursive: true })
  } catch (err) {
    return { ok: false, code: 'symlink-failed', error: `Could not create ${TARGET_DIR}: ${(err as Error).message}` }
  }

  // Replace an existing symlink (yours or otherwise); refuse to clobber a real file.
  if (existsSync(TARGET_PATH)) {
    try {
      const stat = lstatSync(TARGET_PATH)
      if (stat.isSymbolicLink()) {
        unlinkSync(TARGET_PATH)
      } else {
        return {
          ok: false,
          code: 'occupied',
          error: `${TARGET_PATH} already exists as a regular file. Move or remove it, then try again.`,
        }
      }
    } catch (err) {
      return { ok: false, code: 'symlink-failed', error: `Could not inspect ${TARGET_PATH}: ${(err as Error).message}` }
    }
  }

  try {
    symlinkSync(bundle, TARGET_PATH)
  } catch (err) {
    return { ok: false, code: 'symlink-failed', error: `Could not create symlink at ${TARGET_PATH}: ${(err as Error).message}` }
  }

  return {
    ok: true,
    targetPath: TARGET_PATH,
    pathHasDir: pathHasLocalBin(),
    bundlePath: bundle,
  }
}

export function registerCliHandlers(): void {
  ipcMain.handle(IPC.CLI_PATH_STATUS, (): CliPathStatus => readStatus())
  ipcMain.handle(IPC.CLI_INSTALL_ON_PATH, (): CliInstallResult => performInstall())
}
