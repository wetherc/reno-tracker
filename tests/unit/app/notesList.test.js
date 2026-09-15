import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { notesList } from '../../../src/app/notesList.js';
import { itemOf, setupSchedule, tick } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {string} id @param {string} itemId @param {string} body @param {string} at */
const noteOf = (id, itemId, body, at) => ({
  id,
  scheduleItemId: itemId,
  body,
  createdAt: at,
  updatedAt: at,
});

async function setup() {
  const fx = setupSchedule({
    schedule: [itemOf('a'), itemOf('b')],
    notes: [
      noteOf('n1', 'a', 'Older', '2026-09-01T10:00:00Z'),
      noteOf('n2', 'a', 'Newer', '2026-09-02T10:00:00Z'),
      noteOf('n3', 'b', 'Other item', '2026-09-03T10:00:00Z'),
    ],
  });
  await fx.ctx.openProject('p1');
  const list = notesList({
    ctx: fx.ctx,
    itemId: 'a',
    notes: fx.ctx.payload?.notes ?? [],
  });
  fx.ctx.on('payload', (p) => p && list.update(p.notes));
  const ul = $(list.el.children[1]);
  return { ...fx, list, ul };
}

test('shows only this item, newest first', async () => {
  const { list, ul } = await setup();
  assert.equal(list.el.className, 'notes');
  assert.equal(ul.getAttribute('aria-label'), 'Notes');
  assert.deepEqual(
    ul.children.map((/** @type {any} */ li) => li.children[1].textContent),
    ['Newer', 'Older'],
  );
  assert.equal(ul.children[0].children[0].children[0].tagName, 'TIME');
});

test('adding a note requires text, then clears the box', async () => {
  const { list, log, toasts } = await setup();
  const composer = $(list.el.children[0]);
  const draft = composer.querySelector('textarea');
  composer.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(
    composer.querySelector('.form__error').textContent,
    'Write something first.',
  );
  assert.deepEqual(log, []);
  draft.value = '  Tile arrived  ';
  composer.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(log, ['note a Tile arrived']);
  assert.deepEqual(toasts, ['ok Note added']);
  assert.equal(draft.value, '');
  assert.equal(composer.querySelector('.form__error').hidden, true);
});

test('editing swaps the body for a form and saves', async () => {
  const { ul, log, notes } = await setup();
  const li = ul.children[0];
  const [, edit] = li.children[0].children;
  edit.click();
  assert.equal(li.children[0].hidden, true);
  const editor = li.children[1];
  assert.equal(editor.tagName, 'FORM');
  const area = editor.querySelector('textarea');
  assert.equal(area.value, 'Newer');
  assert.equal(document.activeElement, area);
  area.value = '';
  editor.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(
    editor.querySelector('.form__error').textContent,
    'A note cannot be blank. Delete it instead.',
  );
  area.value = 'Newest';
  editor.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(log, ['edit n2 Newest']);
  assert.equal(notes().find((n) => n.id === 'n2')?.body, 'Newest');
  const fresh = ul.children[0];
  assert.equal(fresh.children[1].textContent, 'Newest');
  assert.match(fresh.children[0].children[0].textContent, /edited$/);
});

test('cancel restores the body without a write', async () => {
  const { ul, log } = await setup();
  const li = ul.children[1];
  li.children[0].children[1].click();
  const editor = li.children[1];
  const cancel = editor.querySelectorAll('button')[0];
  assert.equal(cancel.textContent, 'Cancel');
  cancel.click();
  assert.equal(li.children[1].tagName, 'P');
  assert.equal(li.children[0].hidden, false);
  assert.deepEqual(log, []);
});

test('delete asks first and shows the empty state when none remain', async () => {
  const { ul, list, log } = await setup();
  ul.children[0].children[0].children[2].click();
  await tick();
  let dialog = dom.body.children[0];
  assert.equal(dialog.children[0].textContent, 'Delete this note?');
  assert.equal(dialog.children[1].textContent, 'Newer');
  $(dialog.children[2].children[0]).click();
  await tick();
  assert.deepEqual(log, []);
  ul.children[0].children[0].children[2].click();
  await tick();
  $(dom.body.children[0].children[2].children[1]).click();
  await tick();
  ul.children[0].children[0].children[2].click();
  await tick();
  $(dom.body.children[0].children[2].children[1]).click();
  await tick();
  assert.deepEqual(log, ['unnote n2', 'unnote n1']);
  assert.equal(ul.hidden, true);
  assert.equal(
    $(list.el.querySelector('.empty-state')).textContent,
    'No notes on this item yet.',
  );
});
