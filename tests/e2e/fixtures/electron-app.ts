import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

type WorkerFixtures = {
  electronApp: ElectronApplication
}

type TestFixtures = {
  page: Page
  mod: string
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  electronApp: [async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'vaxtly-test-'))

    const app = await electron.launch({
      args: [join(__dirname, '../../../out/main/index.js')],
      env: {
        ...process.env,
        VAXTLY_TEST_USERDATA: userDataDir,
        NODE_ENV: 'production',
      },
    })

    // Wait for first window, dismiss WelcomeGuide if present
    const page = await app.firstWindow()
    await page.waitForSelector('div.bg-surface-900', { timeout: 15_000 })

    // Dismiss the WelcomeGuide dialog that appears on first launch
    const welcomeSkip = page.getByRole('button', { name: 'Skip' })
    if (await welcomeSkip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await welcomeSkip.click()
      // Wait for dialog to close
      await page.waitForTimeout(300)
    }

    await use(app)

    await app.close()
    await rm(userDataDir, { recursive: true, force: true })
  }, { scope: 'worker' }],

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await use(page)
  },

  mod: async ({}, use) => {
    await use(MOD)
  },
})

export { expect } from '@playwright/test'
