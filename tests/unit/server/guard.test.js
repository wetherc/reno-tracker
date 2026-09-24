import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSource,
  isJsonType,
  localHosts,
} from '../../../src/server/guard.js';

/** @param {() => void} fn @param {number} status */
function throwsStatus(fn, status) {
  assert.throws(fn, (error) => /** @type {any} */ (error).status === status);
}

test('localHosts names both loopback names, bare only on port 80', () => {
  assert.deepEqual(localHosts(3000), ['127.0.0.1:3000', 'localhost:3000']);
  assert.deepEqual(localHosts(80), [
    '127.0.0.1:80',
    'localhost:80',
    '127.0.0.1',
    'localhost',
  ]);
});

test('checkSource accepts a loopback Host with no Origin or a local one', () => {
  checkSource({ host: '127.0.0.1:3000' }, 3000);
  checkSource({ host: 'LOCALHOST:3000' }, 3000);
  checkSource(
    { host: 'localhost:3000', origin: 'http://127.0.0.1:3000' },
    3000,
  );
  checkSource({ host: 'localhost', origin: 'http://localhost' }, 80);
});

test('checkSource answers 421 to a foreign, missing, or wrong-port Host', () => {
  throwsStatus(() => checkSource({ host: 'evil.example:3000' }, 3000), 421);
  throwsStatus(() => checkSource({}, 3000), 421);
  throwsStatus(() => checkSource({ host: '127.0.0.1:3001' }, 3000), 421);
  throwsStatus(() => checkSource({ host: '127.0.0.1' }, 3000), 421);
});

test('checkSource answers 403 to a foreign or null Origin', () => {
  const host = '127.0.0.1:3000';
  for (const origin of [
    'http://evil.example',
    'null',
    'https://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ]) {
    throwsStatus(() => checkSource({ host, origin }, 3000), 403);
  }
});

test('isJsonType accepts application/json with or without parameters', () => {
  assert.equal(isJsonType('application/json'), true);
  assert.equal(isJsonType('Application/JSON; charset=utf-8'), true);
  assert.equal(isJsonType('application/jsonp'), false);
  assert.equal(isJsonType('text/plain;charset=UTF-8'), false);
  assert.equal(isJsonType(undefined), false);
});
