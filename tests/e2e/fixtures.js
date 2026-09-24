// The Playwright test with one automatic check: a page that breaks the
// server's Content-Security-Policy fails the test. Chromium reports each
// blocked load or style in the console and does not throw.
import { test as base, expect } from '@playwright/test';

export { expect };

/** @type {import('@playwright/test').Fixtures<{ cspGuard: null }, {}, import('@playwright/test').PlaywrightTestArgs>} */
const fixtures = {
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
