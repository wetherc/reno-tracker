// The Playwright test with two automatic fixtures. A page that breaks the
// server's Content-Security-Policy fails the test, because Chromium
// reports each blocked load or style in the console and does not throw.
// Each test of the server project starts from an empty database, so a
// test that fails before it deletes its project cannot change the next
// test.
import { test as base, expect } from '@playwright/test';

export { expect };

/** @type {import('@playwright/test').Fixtures<{ cspGuard: null, emptyDb: null }, {}, import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions>} */
const fixtures = {
  emptyDb: [
    async ({ request }, use, testInfo) => {
      if (testInfo.project.name === 'server') {
        const projects = await (await request.get('/api/projects')).json();
        for (const { id } of projects) {
          await request.delete(`/api/projects/${id}`);
        }
      }
      await use(null);
    },
    { auto: true },
  ],
  cspGuard: [
    async ({ page }, use) => {
      /** @type {string[]} */
      const violations = [];
      page.on('console', (message) => {
        if (message.text().includes('Content Security Policy')) {
          violations.push(message.text());
        }
      });
      await use(null);
      expect(violations).toEqual([]);
    },
    { auto: true },
  ],
};

export const test = base.extend(fixtures);
