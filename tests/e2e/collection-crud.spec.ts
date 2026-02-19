import { test, expect } from './fixtures/electron-app'

test('create a new collection', async ({ page }) => {
  await page.getByTitle('New Collection').click()

  // A new collection named "New Collection" should appear in the sidebar
  await expect(page.getByText('New Collection')).toBeVisible({ timeout: 5_000 })
})

test('rename collection via context menu', async ({ page }) => {
  // Right-click on the collection
  await page.getByText('New Collection').first().click({ button: 'right' })
  await page.locator('button', { hasText: 'Rename' }).click()

  const renameInput = page.locator('input.border-brand-500')
  await expect(renameInput).toBeVisible({ timeout: 3_000 })

  await renameInput.fill('Renamed Collection')
  await renameInput.press('Enter')

  await expect(page.getByText('Renamed Collection')).toBeVisible({ timeout: 3_000 })
})

test('create a request inside the collection', async ({ page }) => {
  // Right-click on the collection
  await page.getByText('Renamed Collection').click({ button: 'right' })
  await page.locator('button', { hasText: 'Add Request' }).click()

  // Should see a URL input for the new request
  await expect(page.locator('input.url-input')).toBeVisible({ timeout: 5_000 })
})

test('delete collection via context menu', async ({ page }) => {
  // Right-click on the collection
  await page.getByText('Renamed Collection').click({ button: 'right' })
  await page.locator('button', { hasText: 'Delete' }).click()

  // Collection should be gone
  await expect(page.getByText('Renamed Collection')).not.toBeVisible({ timeout: 3_000 })
})
