import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },

  use: {
    baseURL: 'http://localhost:3333',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile tests disabled - run `npx playwright install webkit` to enable
    // {
    //   name: 'mobile',
    //   use: { ...devices['iPhone 13'] },
    // },
  ],

  webServer: {
    command: 'node dev-server.js',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    cwd: __dirname,
  },
});
