import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountNotes } from '../../../src/app/notesView.js';
import { mountShell } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, setupSchedule } from './scheduleFixtures.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {string} id @param {string} itemId @param {string} body @param {string} at @param {string} [edited] */
const noteOf = (id, itemId, body, at, edited = at) => ({
  id,
  scheduleItemId: itemId,
  body,
  createdAt: at,
  updatedAt: edited,
});

/** @param {Parameters<typeof setupSchedule>[0]} seed */
async function setup(seed) {
  const fx = setupSchedule(seed);
  await fx.ctx.openProject('p1');
  const prefs = createPrefs(memoryStorage());
  prefs.write('lastSection', 'notes');
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs,
  });
  const notes = mountNotes({ ctx: fx.ctx, shell });
  notes.show();
  return { ...fx, shell, notes };
}

test('lists every note under its day, newest first, with its item', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a', { responsibleParty: 'Plumber' }), itemOf('b')],
    notes: [
      noteOf('n1', 'a', 'Older', '2026-09-01T10:00:00Z'),
      noteOf('n2', 'b', 'Newer', '2026-09-02T10:00:00Z'),
      noteOf(
        'n3',
        'a',
        'Changed later',
        '2026-09-02T12:00:00Z',
        '2026-09-03T08:00:00Z',
      ),
    ],
  });
  const root = $(shell.body.children[0]);
  assert.equal(root.tagName, 'OL');
  assert.equal(root.getAttribute('aria-label'), 'Notes on Kitchen');
  assert.equal(root.children.length, 2);
  const [day2, day1] = root.children;
  assert.equal(day2.children[0].tagName, 'H2');
  assert.equal(day2.children[0].textContent, 'Wednesday, September 2, 2026');
  assert.equal(day1.children[0].textContent, 'Tuesday, September 1, 2026');
  const cards = day2.children[1].children;
  assert.deepEqual(
    cards.map((/** @type {any} */ li) => li.children[1].textContent),
    ['Changed later', 'Newer'],
  );
  const [meta] = cards[0].children;
  const [open, party, when] = meta.children;
  assert.equal(open.textContent, 'Item a');
  assert.equal(party.textContent, 'Plumber');
  assert.equal(when.tagName, 'TIME');
  assert.match(when.textContent, /, edited$/);
  assert.equal(cards[1].children[0].children.length, 2);
  assert.doesNotMatch(cards[1].children[0].children[1].textContent, /edited/);
});

test('the item name opens the editor on the Notes tab', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a')],
    notes: [noteOf('n1', 'a', 'Hello', '2026-09-01T10:00:00Z')],
  });
  const open = $(shell.body.children[0]).querySelector('.note__item');
  open.click();
  const dialog = $(document.body).querySelector('dialog');
  assert.equal(dialog.querySelector('.modal__title').textContent, 'Item a');
  const selected = dialog
    .querySelectorAll('[role="tab"]')
    .find((/** @type {any} */ t) => t.getAttribute('aria-selected') === 'true');
  assert.equal(selected.textContent, 'Notes');
  dialog.close();
});

test('with no notes the empty state points at the schedule', async () => {
  const { shell } = await setup({ schedule: [itemOf('a')] });
  const empty = $(shell.body.children[0]);
  assert.equal(empty.className, 'empty-state u-muted');
  assert.match(empty.textContent, /^No notes yet/);
  $(empty).querySelector('button').click();
  assert.equal(shell.section, 'schedule');
});

test('show does nothing with no project open', async () => {
  const { shell, notes, ctx } = await setup({});
  ctx.closeProject();
  shell.setBody('kept');
  notes.show();
  assert.equal(shell.body.textContent, 'kept');
});
