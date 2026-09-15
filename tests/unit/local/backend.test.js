import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend, readBackend } from '../../../src/api/backend.js';
import { memoryStorage } from '../../../src/storage/prefs.js';

/** @param {string | null} content */
function docWithMeta(content) {
  return {
    /** @param {string} selector */
    querySelector(selector) {
      assert.equal(selector, 'meta[name="reno-backend"]');
      return content === null
        ? null
        : /** @type {Element} */ (
            /** @type {unknown} */ ({ getAttribute: () => content })
          );
    },
  };
}

test('the meta tag picks the backend and server is the default', () => {
  assert.equal(readBackend(docWithMeta('local')), 'local');
  assert.equal(readBackend(docWithMeta('server')), 'server');
  assert.equal(readBackend(docWithMeta('other')), 'server');
  assert.equal(readBackend(docWithMeta(null)), 'server');
});

test('both backends expose the same methods', async () => {
  const local = createBackend('local', memoryStorage());
  const server = createBackend('server', memoryStorage());
  assert.deepEqual(Object.keys(local).sort(), Object.keys(server).sort());
  assert.deepEqual(await local.listProjects(), []);
});
