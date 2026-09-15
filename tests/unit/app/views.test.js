import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountViews, readView, VIEWS } from '../../../src/app/views.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';

installDom();

test('readView falls back to the table', () => {
  assert.equal(readView(null), 'table');
  assert.equal(readView('nope'), 'table');
  assert.equal(readView('gantt'), 'gantt');
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
