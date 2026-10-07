import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  isNarrow,
  mountViews,
  NARROW_QUERY,
  readView,
  VIEWS,
} from '../../../src/app/views.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';

installDom();

test('readView falls back to the table', () => {
  assert.equal(readView(null), 'table');
  assert.equal(readView('nope'), 'table');
  assert.equal(readView('gantt'), 'gantt');
  assert.equal(readView(null, 'agenda'), 'agenda');
});

test('a narrow screen with no saved view opens the agenda', () => {
  const prefs = createPrefs(memoryStorage());
  const onChange = () => {};
  assert.equal(mountViews({ prefs, narrow: true, onChange }).view, 'agenda');
  assert.equal(mountViews({ prefs, narrow: false, onChange }).view, 'table');
  prefs.write('lastView', 'gantt');
  assert.equal(mountViews({ prefs, narrow: true, onChange }).view, 'gantt');
});

test('isNarrow asks matchMedia for the breakpoint, and is false without it', () => {
  const g = /** @type {any} */ (globalThis);
  assert.equal(g.matchMedia, undefined);
  assert.equal(isNarrow(), false);
  /** @type {string[]} */
  const asked = [];
  g.matchMedia = (/** @type {string} */ q) => (
    asked.push(q),
    { matches: true }
  );
  try {
    assert.equal(isNarrow(), true);
    assert.equal(
      mountViews({ prefs: createPrefs(memoryStorage()), onChange() {} }).view,
      'agenda',
    );
    assert.deepEqual(asked, [NARROW_QUERY, NARROW_QUERY]);
  } finally {
    delete g.matchMedia;
  }
});

test('the switch starts on the saved view and remembers a change', () => {
  const prefs = createPrefs(memoryStorage());
  prefs.write('lastView', 'agenda');
  /** @type {string[]} */
  const seen = [];
  const views = mountViews({ prefs, onChange: (v) => seen.push(v) });
  assert.equal(views.view, 'agenda');
  assert.equal(views.el.getAttribute('aria-label'), 'View');
  const buttons = /** @type {any[]} */ (
    /** @type {unknown} */ (views.el.children)
  );
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    VIEWS.map((v) => v.label),
  );
  assert.equal(buttons[3].getAttribute('aria-checked'), 'true');
  buttons[1].click();
  assert.equal(views.view, 'calendar');
  assert.equal(prefs.read('lastView'), 'calendar');
  views.set('gantt');
  assert.equal(views.view, 'gantt');
  views.set('gantt');
  assert.deepEqual(seen, ['calendar', 'gantt']);
});

test('visit switches the view without saving it', () => {
  const prefs = createPrefs(memoryStorage());
  prefs.write('lastView', 'calendar');
  /** @type {string[]} */
  const seen = [];
  const views = mountViews({ prefs, onChange: (v) => seen.push(v) });
  views.visit('agenda');
  views.visit('agenda');
  assert.equal(views.view, 'agenda');
  assert.equal(prefs.read('lastView'), 'calendar');
  assert.deepEqual(seen, ['agenda']);
  const buttons = /** @type {any[]} */ (
    /** @type {unknown} */ (views.el.children)
  );
  assert.equal(buttons[3].getAttribute('aria-checked'), 'true');
});
