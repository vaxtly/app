import { test, expect } from './fixtures/electron-app'

const settingsDialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').filter({ hasText: 'Settings' }).filter({ hasText: 'General' })

test('open Settings with Ctrl+, and navigate tabs', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+Comma`)
  const dialog = settingsDialog(page)
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Navigate all 4 tabs
  for (const tab of ['General', 'Data', 'Remote Sync', 'Vault']) {
    await dialog.getByRole('button', { name: tab }).click()
    await expect(dialog.getByRole('button', { name: tab })).toBeVisible()
  }

  // Close via the visible close X button
  await dialog.locator('button[aria-label="Close"]').last().click()
  await expect(dialog).not.toBeVisible({ timeout: 3_000 })
})

test('close Settings with Escape', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+Comma`)
  const dialog = settingsDialog(page)
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Click a tab button to ensure focus is inside the dialog
  await dialog.getByRole('button', { name: 'General' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible({ timeout: 3_000 })
})

test('close Settings with close button', async ({ page, mod }) => {
  await page.keyboard.press(`${mod}+Comma`)
  const dialog = settingsDialog(page)
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  await dialog.locator('button[aria-label="Close"]').last().click()
  await expect(dialog).not.toBeVisible({ timeout: 3_000 })
})
