import { test, expect } from './fixtures/electron-app'
import { startTestServer, type TestServer } from './fixtures/test-server'

let server: TestServer

test.beforeAll(async () => {
  server = await startTestServer()
})

test.afterAll(async () => {
  await server.close()
})

test('GET request shows 200 and response body', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  await page.locator('input.url-input').fill(`${server.url}/echo`)
  await page.locator('button.btn-send').click()

  await expect(page.locator('.rv-status-code')).toContainText('200', { timeout: 10_000 })
})

test('POST request with JSON body', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  // Set method to POST
  await page.locator('select.method-select').selectOption('POST')
  await page.locator('input.url-input').fill(`${server.url}/echo`)

  // Switch to Body tab
  await page.getByRole('button', { name: 'Body' }).click()

  // Select JSON body type (it's a button, not a select)
  await page.locator('.be-type', { hasText: 'JSON' }).click()

  // Wait for CodeMirror editor, type into it
  const cmEditor = page.locator('.cm-content')
  await expect(cmEditor).toBeVisible({ timeout: 5_000 })
  await cmEditor.click()
  await page.keyboard.type('{"hello":"world"}')

  await page.locator('button.btn-send').click()

  await expect(page.locator('.rv-status-code')).toContainText('200', { timeout: 10_000 })
})

test('request to unreachable URL shows error', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  await page.locator('input.url-input').fill('http://127.0.0.1:1')
  await page.locator('button.btn-send').click()

  await expect(page.locator('.rv-status-code')).toContainText('ERR', { timeout: 15_000 })
})
