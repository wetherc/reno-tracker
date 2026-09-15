import { defineConfig } from '@playwright/test';

// The config is evaluated once per process, so the port has to come from
// one place that every process agrees on. E2E_PORT overrides the default
// when 3117 is taken. The server reads PORT and the database path from
// the environment, and the e2e database lives in a throwaway file.
// PLAYWRIGHT_CHANNEL=chrome runs the tests in an installed Google Chrome
// on a machine that cannot download the bundled Chromium.
const port = Number(process.env.E2E_PORT ?? 3117);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL, channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning src/server/index.js',
    url: baseURL,
    env: { PORT: String(port), RENO_DB_PATH: 'test-results/e2e.sqlite' },
    reuseExistingServer: false,
  },
});
