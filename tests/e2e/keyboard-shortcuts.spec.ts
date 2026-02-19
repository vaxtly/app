import { test, expect } from './fixtures/electron-app'

const settingsDialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').filter({ hasText: 'Settings' }).filter({ hasText: 'General' })

test('Ctrl+N opens a new request tab', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })
})

test('Ctrl+W closes the active tab', async ({ page, mod }) => {
  const emptyState = page.getByText('Create or open a request to get started')

  // Ensure we have a tab open
  await page.keyboard.press(`${mod}+n`)
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })

  // Close all tabs until empty state
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press(`${mod}+w`)
    if (await emptyState.isVisible({ timeout: 1_000 }).catch(() => false)) break
  }
  await expect(emptyState).toBeVisible({ timeout: 3_000 })
})

test('Ctrl+B toggles the sidebar', async ({ page, mod }) => {
  const sidebar = page.locator('div.w-60.shrink-0.border-r')
  await expect(sidebar).toBeVisible()

  await page.keyboard.press(`${mod}+b`)
  await expect(sidebar).not.toBeVisible({ timeout: 3_000 })

  await page.keyboard.press(`${mod}+b`)
  await expect(sidebar).toBeVisible({ timeout: 3_000 })
})

test('Ctrl+, opens Settings modal', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+Comma`)
  const dialog = settingsDialog(page)
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Click a tab button to ensure focus inside dialog, then Escape
  await dialog.getByRole('button', { name: 'General' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible({ timeout: 3_000 })
})
