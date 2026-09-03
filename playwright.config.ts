import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './.work/browser-results',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '.work/browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
