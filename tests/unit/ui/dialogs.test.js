import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { focusKey } from '../../../src/ui/focusKey.js';
import { modal } from '../../../src/ui/Modal.js';
import { confirmDialog } from '../../../src/ui/ConfirmDialog.js';
import { createToaster, MAX_TOASTS } from '../../../src/ui/Toast.js';
import {
  applyTheme,
  readTheme,
  themeToggle,
} from '../../../src/ui/ThemeToggle.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

test('modal labels itself, opens, and restores focus on close', () => {
  let closed = 0;
  const action = document.createElement('button');
  const m = modal({
    title: 'New project',
    body: ['Fields'],
    actions: [action],
    onClose: () => closed++,
  });
  assert.equal(m.el.tagName, 'DIALOG');
  assert.equal(m.el.className, 'modal');
  const [header, body, footer] = m.el.children;
  const heading = header.children[0];
  assert.equal(heading.tagName, 'H2');
  assert.equal(heading.textContent, 'New project');
  assert.equal(m.el.getAttribute('aria-labelledby'), heading.id);
  assert.equal(body, m.body);
  assert.equal(body.textContent, 'Fields');
  assert.equal(footer.children[0], action);

  const opener = document.createElement('button');
  dom.body.append(...$([opener]));
  opener.focus();
  m.open();
  assert.equal(m.el.open, true);
  $(header.children[1]).click();
  assert.equal(m.el.open, false);
  assert.equal(closed, 1);
  assert.equal(dom.activeElement, opener);
  opener.remove();

  dom.activeElement = null;
  m.open();
  m.close();
  assert.equal(closed, 2);
  assert.equal(dom.activeElement, null);
  assert.equal(modal({ title: 'Bare' }).el.children.length, 2);
});

test('modal moves the toast region inside while open and back after', () => {
  const region = document.createElement('div');
  region.id = 'toasts';
  dom.body.append($(region));
  const outer = modal({ title: 'Edit' });
  const inner = modal({ title: 'Confirm' });
  dom.body.append($(outer.el), $(inner.el));
  outer.open();
  assert.equal($(region).parentNode, outer.el);
  inner.open();
  assert.equal($(region).parentNode, inner.el);
  inner.close();
  assert.equal($(region).parentNode, outer.el);
  outer.close();
  assert.equal($(region).parentNode, dom.body);
  region.remove();
  outer.open();
  outer.close();
  outer.el.remove();
  inner.el.remove();
});

test('modal sends the toast region home when an older dialog closes last', () => {
  // The browser fires the close event of a dialog after the next task,
  // so Edit in a view opens the editor before the view has closed.
  const region = document.createElement('div');
  region.id = 'toasts';
  dom.body.append($(region));
  const view = modal({ title: 'View' });
  const editor = modal({ title: 'Edit' });
  dom.body.append($(view.el), $(editor.el));
  view.open();
  editor.open();
  assert.equal($(region).parentNode, editor.el);
  view.close();
  view.el.remove();
  assert.equal($(region).parentNode, editor.el);
  editor.close();
  assert.equal($(region).parentNode, dom.body);
  region.remove();
  editor.el.remove();
});

test('modal focuses the control that took the place of a removed opener', () => {
  const m = modal({ title: 'Edit' });
  const opener = focusKey(document.createElement('button'), 'row-1:open');
  dom.body.append(...$([opener]));
  opener.focus();
  m.open();
  const fresh = focusKey(document.createElement('button'), 'row-1:open');
  opener.replaceWith($(fresh));
  dom.activeElement = dom.body;
  m.close();
  assert.equal(dom.activeElement, fresh);
  fresh.remove();
});

test('confirmDialog resolves true on confirm and false otherwise', async () => {
  const pending = confirmDialog({
    title: 'Delete Kitchen?',
    message: 'Every item goes with it.',
  });
  const dialog = dom.body.children[0];
  assert.equal(dialog.tagName, 'DIALOG');
  const actions = dialog.children[2].children;
  assert.equal(actions[0].textContent, 'Cancel');
  assert.equal(actions[1].textContent, 'Delete');
  assert.equal(actions[1].className, 'btn btn--danger');
  $(actions[1]).click();
  assert.equal(await pending, true);
  assert.equal(dom.body.children.length, 0);

  const cancelled = confirmDialog({
    title: 'Import?',
    message: 'Adds a project.',
    confirmLabel: 'Import',
    cancelLabel: 'Back',
    danger: false,
  });
  const second = dom.body.children[0];
  const [back, go] = second.children[2].children;
  assert.equal(back.textContent, 'Back');
  assert.equal(go.className, 'btn btn--primary');
  $(back).click();
  assert.equal(await cancelled, false);

  const escaped = confirmDialog({ title: 'X', message: 'Y' });
  $(dom.body.children[0]).close();
  assert.equal(await escaped, false);
});

test('a toast in a dialog scrolls into view, and one in the page does not', () => {
  const region = document.createElement('div');
  const toaster = createToaster(region, {
    setTimer: /** @type {any} */ (() => 0),
  });
  toaster.show('In the page');
  assert.equal($(region.children[0]).scrolledInto, null);
  const dialog = document.createElement('dialog');
  dialog.append(region);
  toaster.failure('Could not save');
  assert.deepEqual($(region.children[1]).scrolledInto, { block: 'nearest' });
});

test('toaster shows, times out, and keeps failures', () => {
  const region = document.createElement('div');
  /** @type {Function[]} */
  const timers = [];
  const toaster = createToaster(region, {
    timeout: 10,
    setTimer: /** @type {any} */ (
      (/** @type {Function} */ fn, /** @type {number} */ ms) => {
        assert.equal(ms, 10);
        timers.push(fn);
        return 0;
      }
    ),
  });
  toaster.show('Saved');
  toaster.success('Item saved');
  toaster.failure('Could not save');
  const [info, ok, bad] = region.children;
  assert.equal(info.className, 'toast');
  assert.equal(info.getAttribute('role'), null);
  assert.equal(ok.className, 'toast toast--success');
  assert.equal(bad.className, 'toast toast--danger');
  assert.equal(bad.getAttribute('role'), null);
  assert.equal(bad.children[0].textContent, 'Could not save');
  assert.equal(timers.length, 2);
  timers.forEach((fn) => fn());
  assert.deepEqual([...region.children], [bad]);
  $(bad.children[1]).click();
  assert.equal(region.children.length, 0);
});

test('toaster keeps three and pushes out the oldest that times out', () => {
  const region = document.createElement('div');
  const toaster = createToaster(region, {
    setTimer: /** @type {any} */ (() => 0),
  });
  /** @returns {string[]} */
  const texts = () =>
    $(region).children.map((/** @type {any} */ t) => t.children[0].textContent);
  toaster.failure('Bad one');
  toaster.success('A');
  toaster.success('B');
  toaster.success('C');
  assert.equal(MAX_TOASTS, 3);
  assert.deepEqual(texts(), ['Bad one', 'B', 'C']);
  toaster.failure('Bad two');
  toaster.failure('Bad three');
  assert.deepEqual(texts(), ['Bad one', 'Bad two', 'Bad three']);
  // When every toast is a failure, the oldest failure goes.
  toaster.failure('Bad four');
  assert.deepEqual(texts(), ['Bad two', 'Bad three', 'Bad four']);
});

test('toaster counts a repeat and restarts its timer', () => {
  const region = document.createElement('div');
  /** @type {Function[]} */
  const timers = [];
  const toaster = createToaster(region, {
    setTimer: /** @type {any} */ (
      (/** @type {Function} */ fn) => {
        timers.push(fn);
        return 0;
      }
    ),
  });
  toaster.success('Saved Demo');
  toaster.success('Saved Tile');
  const again = toaster.success('Saved Demo');
  assert.equal(region.children.length, 2);
  const [tile, demo] = region.children;
  assert.equal(demo.children[0].textContent, 'Saved Demo (2 times)');
  assert.equal(tile.children[0].textContent, 'Saved Tile');
  // The first timer of the repeat is stale and leaves the toast up.
  timers[0]();
  assert.equal(region.children.length, 2);
  timers[2]();
  assert.deepEqual([...region.children], [tile]);
  // The same text in another tone is its own toast.
  toaster.failure('Saved Tile');
  assert.equal(region.children.length, 2);
  // A dismissed toast's timer does nothing, and a new one starts at one.
  again();
  toaster.success('Saved Demo');
  assert.equal($(region).children.at(-1).children[0].textContent, 'Saved Demo');
});

test('toaster returns a dismiss handle', () => {
  const region = document.createElement('div');
  const dismiss = createToaster(region, {
    setTimer: /** @type {any} */ (() => 0),
  }).show('Hi');
  assert.equal(region.children.length, 1);
  dismiss();
  assert.equal(region.children.length, 0);
});

test('readTheme and applyTheme', () => {
  assert.equal(readTheme('dark'), 'dark');
  assert.equal(readTheme('light'), 'light');
  assert.equal(readTheme('sepia'), 'system');
  assert.equal(readTheme(null), 'system');
  const root = document.createElement('html');
  applyTheme(root, 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  applyTheme(root, 'system');
  assert.equal(root.getAttribute('data-theme'), null);
});

test('themeToggle reads the saved theme and writes changes', () => {
  const store = memoryStorage();
  const prefs = createPrefs(store);
  prefs.write('theme', 'dark');
  const root = document.createElement('html');
  const toggle = themeToggle({ prefs, root });
  assert.equal(toggle.value, 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  const [auto, light] = toggle.el.children;
  $(light).click();
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(prefs.read('theme'), 'light');
  $(auto).click();
  assert.equal(root.getAttribute('data-theme'), null);
  assert.equal(prefs.read('theme'), null);
  const fresh = themeToggle({ prefs: createPrefs(memoryStorage()) });
  assert.equal(fresh.value, 'system');
});
