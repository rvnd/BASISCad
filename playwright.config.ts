import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173/BASISCad/';
const usingRelay = Boolean(process.env.PLAYWRIGHT_RELAY_URL);
const port = new URL(baseURL).port || '5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !usingRelay,
  forbidOnly: Boolean(process.env.CI),
  workers: usingRelay ? 1 : process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // Optionally test with an installed browser, e.g. PLAYWRIGHT_CHANNEL=chrome.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !usingRelay,
    timeout: 30_000,
  },
});
