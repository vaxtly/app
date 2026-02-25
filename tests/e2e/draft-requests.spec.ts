/**
 * Draft request lifecycle tests.
 * Tests the in-memory draft tab flow: create, send, save to collection, and transience.
 */
import { test, expect } from '@playwright/test'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startTestServer, type TestServer } from './fixtures/test-server'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const MAIN_JS = join(__dirname, '../../out/main/index.js')

let userDataDir: string
let server: TestServer

test.beforeAll(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'vaxtly-draft-'))
  server = await startTestServer()
})

test.afterAll(async () => {
  await server.close()
  await rm(userDataDir, { recursive: true, force: true })
})

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [MAIN_JS],
    env: {
      ...process.env,
      VAXTLY_TEST_USERDATA: userDataDir,
      NODE_ENV: 'production',
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('div.bg-surface-900', { timeout: 15_000 })

  // Dismiss WelcomeGuide if visible
  const skip = page.getByRole('button', { name: 'Skip' })
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click()
    await page.waitForTimeout(300)
  }

  return { app, page }
}

test('Cmd+N creates a draft tab with empty request', async () => {
  const { app, page } = await launchApp()

  await page.keyboard.press(`${MOD}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  // The tab should show "New Request" label
  const tabBar = page.locator('[role="tablist"]')
  await expect(tabBar.locator('[role="tab"]', { hasText: 'New Request' })).toBeVisible()

  // URL input should be empty
  const urlValue = await page.locator('input.url-input').inputValue()
  expect(urlValue).toBe('')

  await app.close()
})

test('draft request can be sent without saving', async () => {
  const { app, page } = await launchApp()

  await page.keyboard.press(`${MOD}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  // Fill URL and send
  await page.locator('input.url-input').fill(`${server.url}/echo`)
  await page.locator('button.btn-send').click()

  // Should get 200 response
  await expect(page.locator('.rv-status-code')).toContainText('200', { timeout: 10_000 })

  await app.close()
})

test('Cmd+S on draft shows collection picker modal', async () => {
  const { app, page } = await launchApp()

  await page.keyboard.press(`${MOD}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  // Fill URL so the request has some data
  await page.locator('input.url-input').fill(`${server.url}/echo`)

  // Press Cmd+S to trigger save
  await page.keyboard.press(`${MOD}+s`)

  // The collection picker modal should appear
  const modal = page.getByRole('dialog').filter({ hasText: 'Save to Collection' })
  await expect(modal).toBeVisible({ timeout: 5_000 })

  await app.close()
})

test('saving draft to new collection promotes it', async () => {
  const { app, page } = await launchApp()

  await page.keyboard.press(`${MOD}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })
  await page.locator('input.url-input').fill(`${server.url}/echo`)

  // Trigger save
  await page.keyboard.press(`${MOD}+s`)

  const modal = page.getByRole('dialog').filter({ hasText: 'Save to Collection' })
  await expect(modal).toBeVisible({ timeout: 5_000 })

  // Click "New collection" and create one
  const newColBtn = modal.locator('button', { hasText: 'New collection' })
  await newColBtn.click()

  const nameInput = modal.locator('input[placeholder="Collection name"]')
  await expect(nameInput).toBeVisible({ timeout: 3_000 })
  await nameInput.fill('Draft Test Collection')

  const createBtn = modal.locator('button', { hasText: 'Create' })
  await createBtn.click()

  // Modal should close and the request should now be saved
  await expect(modal).not.toBeVisible({ timeout: 5_000 })

  // The sidebar should now show the collection
  const sidebar = page.locator('.sidebar-tree, .collections-list, [class*="sidebar"]').first()
  await expect(page.getByText('Draft Test Collection')).toBeVisible({ timeout: 5_000 })

  await app.close()
})

test('draft tabs do not survive app restart', async () => {
  // Use a fresh data dir for this test
  const tempDir = await mkdtemp(join(tmpdir(), 'vaxtly-draft-persist-'))

  try {
    // First launch — create a draft and a saved request
    const first = await electron.launch({
      args: [MAIN_JS],
      env: { ...process.env, VAXTLY_TEST_USERDATA: tempDir, NODE_ENV: 'production' },
    })
    const page1 = await first.firstWindow()
    await page1.waitForSelector('div.bg-surface-900', { timeout: 15_000 })

    const skip = page1.getByRole('button', { name: 'Skip' })
    if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skip.click()
      await page1.waitForTimeout(300)
    }

    // Create a draft (don't save it)
    await page1.keyboard.press(`${MOD}+n`)
    await expect(page1.locator('input.url-input')).toBeVisible({ timeout: 5_000 })
    await page1.locator('input.url-input').fill('https://draft-should-disappear.com')

    // Wait for state to settle
    await page1.waitForTimeout(500)
    await first.close()

    // Second launch — draft should be gone
    const second = await electron.launch({
      args: [MAIN_JS],
      env: { ...process.env, VAXTLY_TEST_USERDATA: tempDir, NODE_ENV: 'production' },
    })
    const page2 = await second.firstWindow()
    await page2.waitForSelector('div.bg-surface-900', { timeout: 15_000 })

    const skip2 = page2.getByRole('button', { name: 'Skip' })
    if (await skip2.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skip2.click()
      await page2.waitForTimeout(300)
    }

    // The draft tab should not be present
    const urlInput = page2.locator('input.url-input')
    const hasUrlInput = await urlInput.isVisible({ timeout: 3_000 }).catch(() => false)

    if (hasUrlInput) {
      // If there is a URL input visible, it should NOT contain our draft URL
      const val = await urlInput.inputValue()
      expect(val).not.toBe('https://draft-should-disappear.com')
    }

    // The app should be showing empty state or a different tab
    await second.close()
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('double-click on empty tab bar space creates a draft', async () => {
  const { app, page } = await launchApp()

  // Close all existing tabs first
  const emptyState = page.getByText('Create or open a request to get started')
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press(`${MOD}+w`)
    if (await emptyState.isVisible({ timeout: 500 }).catch(() => false)) break
  }

  // Double-click on the tab bar (the scroll container, not on any tab)
  const tabBar = page.locator('.tab-scroll')
  await tabBar.dblclick({ position: { x: 200, y: 10 } })

  // Should create a draft tab
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  await app.close()
})
