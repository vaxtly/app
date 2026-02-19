import { test, expect } from './fixtures/electron-app'
import { startTestServer, type TestServer } from './fixtures/test-server'
import { MOD } from './fixtures/electron-app'

let server: TestServer

test.beforeAll(async () => {
  server = await startTestServer()
})

test.afterAll(async () => {
  await server.close()
})

test('create environment and set a variable', async ({ page }) => {
  // Switch to Environments mode
  await page.getByRole('button', { name: 'Environments' }).click()
  await page.getByTitle('New Environment').click()

  // Name the environment
  const nameInput = page.getByPlaceholder('Environment name')
  await expect(nameInput).toBeVisible({ timeout: 5_000 })
  await nameInput.fill('Test Env')

  // Fill in a variable
  const keyInput = page.locator('input[placeholder="Variable name"]').first()
  await expect(keyInput).toBeVisible({ timeout: 3_000 })
  await keyInput.fill('base_url')

  const valueInput = page.locator('input[placeholder="Variable value"]').first()
  await valueInput.fill(server.url)

  // Save with Ctrl+S
  await page.keyboard.press(`${MOD}+s`)
  await page.waitForTimeout(500)
})

test('activate environment and use variable in request', async ({ page }) => {
  // The env name appears in both the sidebar and the open tab;
  // target the sidebar button specifically
  const sidebarEnv = page.getByRole('button', { name: 'Test Env' }).first()
  await sidebarEnv.click({ button: 'right' })

  const activateBtn = page.locator('button', { hasText: 'Activate' })
  if (await activateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await activateBtn.click()
  }

  // Switch back to Collections mode
  await page.getByRole('button', { name: 'Collections' }).click()

  // Create a new request
  await page.keyboard.press(`${MOD}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  // Use the variable in the URL
  await page.locator('input.url-input').fill('{{base_url}}/echo')
  await page.locator('button.btn-send').click()

  // Should get a successful 200 response
  await expect(page.locator('.rv-status-code')).toContainText('200', { timeout: 10_000 })
})
