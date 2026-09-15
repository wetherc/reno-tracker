import { defineConfig } from '@playwright/test';

// The config is evaluated once per process, so the port has to come from
// one place that every process agrees on. E2E_PORT overrides the default
// when 3117 is taken. The server reads PORT and the database path from
// the environment, and the e2e database lives in a throwaway file.
// PLAYWRIGHT_CHANNEL=chrome runs the tests in an installed Google Chrome
// on a machine that cannot download the bundled Chromium.
const port = Number(process.env.E2E_PORT ?? 3117);
const baseURL = `http://127.0.0.1:${port}`;
// The pages project runs tests/e2e/pages.spec.js against the static
// build served with no API, the way GitHub Pages serves it.
const pagesPort = Number(process.env.PAGES_PORT ?? 3118);
const pagesURL = `http://127.0.0.1:${pagesPort}`;
const PAGES_SPEC = /pages\.spec\.js$/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL, channel: process.env.PLAYWRIGHT_CHANNEL },
  projects: [
    { name: 'server', testIgnore: PAGES_SPEC },
    { name: 'pages', testMatch: PAGES_SPEC, use: { baseURL: pagesURL } },
  ],
  webServer: [
    {
      command: 'node --disable-warning=ExperimentalWarning src/server/index.js',
      url: baseURL,
      env: { PORT: String(port), RENO_DB_PATH: 'test-results/e2e.sqlite' },
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/serve-pages.js',
      url: pagesURL,
      env: { PAGES_PORT: String(pagesPort) },
      reuseExistingServer: false,
    },
  ],
});
