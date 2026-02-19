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

test('GET /status/404 shows 404 status code', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  await page.locator('input.url-input').fill(`${server.url}/status/404`)
  await page.locator('button.btn-send').click()

  await expect(page.locator('.rv-status-code')).toContainText('404', { timeout: 10_000 })
})

test('GET /status/500 shows 500 status code', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  await page.locator('input.url-input').fill(`${server.url}/status/500`)
  await page.locator('button.btn-send').click()

  await expect(page.locator('.rv-status-code')).toContainText('500', { timeout: 10_000 })
})

test('custom header is sent and verified via /check-header', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  await page.locator('input.url-input').fill(`${server.url}/check-header?name=X-Custom-Test`)

  // Switch to Headers tab and add a custom header
  await page.getByRole('button', { name: 'Headers' }).click()
  // The KeyValueEditor should have an empty row — fill it
  const keyInputs = page.locator('.kv-row input.kv-key')
  await keyInputs.first().fill('X-Custom-Test')
  const valueInputs = page.locator('.kv-row input.kv-value')
  await valueInputs.first().fill('hello-vaxtly')

  await page.locator('button.btn-send').click()

  await expect(page.locator('.rv-status-code')).toContainText('200', { timeout: 10_000 })
  // The response body should contain our header value
  await expect(page.locator('.rv-body')).toContainText('hello-vaxtly', { timeout: 10_000 })
})
