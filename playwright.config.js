import { defineConfig } from '@playwright/test';

// Each run picks a port in the ephemeral range so two runs on one machine
// cannot collide. The server reads PORT and the database path from the
// environment, and the e2e database lives in a throwaway file.
const port = 20000 + Math.floor(Math.random() * 20000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL },
  webServer: {
    command: 'node src/server/index.js',
    url: baseURL,
    env: { PORT: String(port), RENO_DB_PATH: 'test-results/e2e.sqlite' },
    reuseExistingServer: false,
  },
});
