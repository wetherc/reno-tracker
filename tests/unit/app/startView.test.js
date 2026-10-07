import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { startView } from '../../../src/app/startView.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

function actions() {
  /** @type {string[]} */
  const calls = [];
  return {
    calls,
    onRetry: () => calls.push('retry'),
    onNew: () => calls.push('new'),
    onLoad: () => calls.push('load'),
  };
}

test('loading shows a status line and no buttons', () => {
  const el = $(startView({ kind: 'loading' }, actions()));
  assert.equal(el.getAttribute('role'), 'status');
  assert.equal(el.textContent, 'Loading projects…');
  assert.equal(el.querySelectorAll('button').length, 0);
});

test('a failure shows its message and a Retry button', () => {
  const a = actions();
  const el = $(
    startView({ kind: 'error', message: 'Could not reach the server.' }, a),
  );
  assert.equal(el.getAttribute('role'), 'alert');
  assert.match(
    el.textContent,
    /^Could not load the projects\. Could not reach the server\./,
  );
  const [retry] = el.querySelectorAll('button');
  assert.equal(retry.textContent, 'Retry');
  assert.equal(retry.getAttribute('data-focus'), 'start:retry');
  retry.click();
  assert.deepEqual(a.calls, ['retry']);
});

test('an empty list invites a new project or a file', () => {
  const a = actions();
  const el = $(startView({ kind: 'ready' }, a));
  assert.equal(el.getAttribute('role'), null);
  assert.match(el.textContent, /^No project open\./);
  const buttons = el.querySelectorAll('button');
  assert.deepEqual(
    buttons.map((/** @type {any} */ b) => b.textContent),
    ['Start a project', 'Load from a file'],
  );
  assert.deepEqual(
    buttons.map((/** @type {any} */ b) => b.getAttribute('data-focus')),
    ['start:new', 'start:load'],
  );
  buttons.forEach((/** @type {any} */ b) => b.click());
  assert.deepEqual(a.calls, ['new', 'load']);
});
