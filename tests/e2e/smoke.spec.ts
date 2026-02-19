import { test, expect } from './fixtures/electron-app'

test('window opens and shows default workspace', async ({ page }) => {
  const title = await page.title()
  expect(title).toBeTruthy()
})

test('sidebar shows Collections mode by default', async ({ page }) => {
  const collectionsBtn = page.getByRole('button', { name: 'Collections' })
  await expect(collectionsBtn).toBeVisible()
})

test('empty state message appears when all tabs are closed', async ({ page, mod }) => {
  // Close all existing tabs to reach empty state
  const emptyState = page.getByText('Create or open a request to get started')
  for (let i = 0; i < 20; i++) {
    if (await emptyState.isVisible({ timeout: 500 }).catch(() => false)) break
    await page.keyboard.press(`${mod}+w`)
  }
  await expect(emptyState).toBeVisible({ timeout: 3_000 })
})
