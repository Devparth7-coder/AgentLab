import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 35_000 },
  retries: 0,
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL: process.env.AGENTLAB_WEB_URL || 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure', trace: 'on-first-retry' },
  reporter: [['list']],
});
