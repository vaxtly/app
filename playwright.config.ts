import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
})
