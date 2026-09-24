import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  currentKey,
  focusKey,
  HOME,
  keepFocus,
  restoreFocus,
  trackFocus,
} from '../../../src/ui/focusKey.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {string} key */
function keyed(key) {
  return focusKey(document.createElement('button'), key);
}

test('keepFocus moves focus to the rebuilt control with the same key', () => {
  const panel = document.createElement('div');
  dom.body.append(...$([panel]));
  const box = keyed('a:complete');
  const icon = document.createElement('span');
  box.append(icon);
  panel.append(box);
  dom.activeElement = $(icon);
  let fresh = box;
  keepFocus(() => {
    fresh = keyed('a:complete');
    panel.replaceChildren(fresh);
    dom.activeElement = dom.body;
  }, panel);
  assert.equal(dom.activeElement, fresh);
});

test('keepFocus leaves focus alone when it is still on the page', () => {
  const panel = document.createElement('div');
  const other = document.createElement('input');
  dom.body.append(...$([panel, other]));
  const box = keyed('a:complete');
  panel.append(box);
  box.focus();
  keepFocus(() => {
    panel.replaceChildren(keyed('a:complete'));
    other.focus();
  });
  assert.equal(dom.activeElement, other);
});

test('the last focused or pressed key stands in when focus is on body', () => {
  const stop = trackFocus(document);
  const box = keyed('b:complete');
  dom.body.append(...$([box]));
  const inner = document.createElement('span');
  box.append(inner);
  dom.dispatchEvent({ type: 'pointerdown', target: inner });
  dom.activeElement = dom.body;
  assert.equal(currentKey(), 'b:complete');
  dom.dispatchEvent({ type: 'focusin', target: dom.body });
  assert.equal(currentKey(), null);
  dom.dispatchEvent({ type: 'focusin', target: box });
  dom.activeElement = null;
  assert.equal(currentKey(), 'b:complete');
  stop();
  dom.dispatchEvent({ type: 'focusin', target: dom.body });
  assert.equal(currentKey(), 'b:complete');
  box.focus();
  assert.equal(currentKey(), 'b:complete');
  box.remove();
  assert.equal(currentKey(), 'b:complete');
});

test('restoreFocus searches the page when the root lacks the key', () => {
  const detached = document.createElement('div');
  const radio = keyed('view:calendar');
  const home = keyed(HOME);
  dom.body.append(...$([radio, home]));
  dom.activeElement = null;
  assert.equal(restoreFocus('view:calendar', detached), true);
  assert.equal(dom.activeElement, radio);
  radio.remove();
  home.remove();
});

test('restoreFocus falls back to the home control, then gives up', () => {
  trackFocus(document)();
  const home = keyed(HOME);
  dom.body.append(...$([home]));
  dom.activeElement = null;
  assert.equal(restoreFocus(null), false);
  assert.equal(restoreFocus('gone:open'), true);
  assert.equal(dom.activeElement, home);
  assert.equal(restoreFocus('gone:open'), false, 'focus is not lost');
  home.remove();
  dom.activeElement = null;
  assert.equal(restoreFocus('gone:open'), false);
});
