import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, press } from '../domShim.js';
import { sectionLabel } from '../../../src/ui/sectionLabel.js';
import { emptyState } from '../../../src/ui/emptyState.js';
import { segSwitch } from '../../../src/ui/SegSwitch.js';
import { tabs } from '../../../src/ui/Tabs.js';
import { disclosure } from '../../../src/ui/Disclosure.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

test('sectionLabel', () => {
  const el = sectionLabel('Notes');
  assert.equal(el.tagName, 'H3');
  assert.equal(el.className, 'section-label');
  assert.equal(el.textContent, 'Notes');
  assert.equal(sectionLabel('X', { tag: 'span' }).tagName, 'SPAN');
});

test('emptyState with and without an action', () => {
  const plain = emptyState('No notes yet.');
  assert.equal(plain.className, 'empty-state u-muted');
  assert.equal(plain.textContent, 'No notes yet.');
  const action = document.createElement('button');
  const withAction = emptyState('No projects yet.', { action });
  assert.equal(withAction.children[0].tagName, 'BR');
  assert.equal(withAction.children[1], action);
});

test('segSwitch marks the choice and moves with arrows', () => {
  /** @type {string[]} */
  const seen = [];
  const sw = segSwitch({
    label: 'View',
    value: 'table',
    options: [
      { value: 'table', label: 'Table', icon: 'grip', title: 'Rows' },
      { value: 'gantt', label: 'Gantt' },
    ],
    onChange: (v) => seen.push(v),
  });
  assert.equal(sw.el.getAttribute('role'), 'radiogroup');
  assert.equal(sw.el.getAttribute('aria-label'), 'View');
  const [table, gantt] = sw.el.children;
  assert.equal(table.getAttribute('role'), 'radio');
  assert.equal(table.getAttribute('aria-checked'), 'true');
  assert.equal($(table).title, 'Rows');
  assert.equal(table.classList.contains('seg-switch__btn--active'), true);
  assert.equal($(table).tabIndex, 0);
  assert.equal($(gantt).tabIndex, -1);
  $(gantt).click();
  assert.equal(sw.value, 'gantt');
  assert.equal(gantt.getAttribute('aria-checked'), 'true');
  assert.equal(table.getAttribute('aria-checked'), 'false');
  press($(gantt), 'ArrowRight');
  assert.equal(sw.value, 'table');
  assert.equal(document.activeElement, table);
  press($(table), 'ArrowLeft');
  assert.equal(sw.value, 'gantt');
  press($(gantt), 'ArrowUp');
  assert.equal(sw.value, 'table');
  press($(table), 'ArrowDown');
  assert.equal(sw.value, 'gantt');
  assert.equal(press($(gantt), 'Enter'), true);
  sw.set('table', { silent: true });
  sw.set('table');
  assert.deepEqual(seen, ['gantt', 'table', 'gantt', 'table', 'gantt']);
});

test('tabs wire aria and switch panels', () => {
  /** @type {string[]} */
  const seen = [];
  const a = document.createElement('div');
  const b = document.createElement('div');
  const t = tabs({
    id: 'item',
    items: [
      { id: 'notes', label: 'Notes', panel: a },
      { id: 'log', label: 'Log', panel: b },
    ],
    onChange: (id) => seen.push(id),
  });
  const list = t.el.children[0];
  assert.equal(list.getAttribute('role'), 'tablist');
  const [tabA, tabB] = list.children;
  assert.equal(tabA.id, 'item-tab-notes');
  assert.equal(tabA.getAttribute('aria-controls'), 'item-panel-notes');
  assert.equal(tabA.getAttribute('aria-selected'), 'true');
  assert.equal(a.id, 'item-panel-notes');
  assert.equal(a.getAttribute('role'), 'tabpanel');
  assert.equal(a.getAttribute('aria-labelledby'), 'item-tab-notes');
  assert.equal(a.hidden, false);
  assert.equal(b.hidden, true);
  $(tabB).click();
  assert.equal(t.current, 'log');
  assert.equal(b.hidden, false);
  assert.equal(a.hidden, true);
  press($(tabB), 'ArrowRight');
  assert.equal(t.current, 'notes');
  press($(tabA), 'ArrowLeft');
  assert.equal(t.current, 'log');
  press($(tabB), 'Home');
  assert.equal(t.current, 'notes');
  press($(tabA), 'End');
  assert.equal(t.current, 'log');
  assert.equal(press($(tabB), 'Tab'), true);
  t.select('log');
  assert.deepEqual(seen, ['log', 'notes', 'log', 'notes', 'log']);
  const preselected = tabs({
    id: 'x',
    items: [{ id: 'one', label: 'One', panel: document.createElement('div') }],
    selected: 'one',
  });
  assert.equal(preselected.current, 'one');
});

test('disclosure toggles content and aria-expanded', () => {
  /** @type {boolean[]} */
  const seen = [];
  const d = disclosure({
    summary: 'Variance log',
    content: ['3 entries'],
    onToggle: (open) => seen.push(open),
  });
  const [toggle, content] = d.el.children;
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), content.id);
  assert.equal($(content).hidden, true);
  assert.equal(content.textContent, '3 entries');
  assert.equal(d.content, content);
  $(toggle).click();
  assert.equal(d.open, true);
  assert.equal($(content).hidden, false);
  assert.equal(d.el.classList.contains('disclosure--open'), true);
  d.toggle();
  assert.equal(d.open, false);
  d.setOpen(true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(seen, [true, false]);
  assert.equal(disclosure({ summary: 'S', open: true }).open, true);
});
