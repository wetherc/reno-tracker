import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { openScheduleEditor } from '../../../src/app/scheduleEditor.js';
import { itemOf, setupSchedule, tick } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {any} root @param {string} id */
const byId = (root, id) => root.querySelector(`#${id}`);

test('a new item defaults to the project start and saves', async () => {
  const fx = setupSchedule();
  await fx.ctx.openProject('p1');
  const dialog = openScheduleEditor({ ctx: fx.ctx });
  const el = $(dialog.el);
  assert.equal(el.className, 'modal');
  assert.equal(el.open, true);
  assert.equal(el.children[0].children[0].textContent, 'New schedule item');
  const form = el.querySelector('form');
  assert.equal(form.getAttribute('aria-label'), 'New schedule item');
  assert.equal(form.querySelectorAll('.editor__reason').length, 0);
  const start = form.querySelector('[type="date"]');
  assert.equal(start.value, '2026-09-01');
  form.dispatchEvent({ type: 'submit' });
  await tick();
  const errors = form
    .querySelectorAll('.form__error')
    .filter((/** @type {any} */ e) => !e.hidden);
  assert.deepEqual(
    errors.map((/** @type {any} */ e) => e.textContent),
    ['title cannot be blank'],
  );
  const title = form.querySelector('[type="text"]');
  title.value = ' Demo ';
  const dates = form.querySelectorAll('[type="date"]');
  dates[1].value = '2026-08-30';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.match(
    form
      .querySelectorAll('.form__error')
      .filter((/** @type {any} */ e) => !e.hidden)[0].textContent,
    /endDate .* is before startDate/,
  );
  dates[1].value = '2026-09-04';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['create Demo']);
  assert.deepEqual(fx.toasts, ['ok Added Demo']);
  assert.equal(el.open, false);
  assert.equal(dom.body.children.length, 0);
  assert.equal(fx.items()[0].endDate, '2026-09-04');
  assert.equal(fx.items()[0].actualCents, null);
});

test('bad money text marks the field and blocks the save', async () => {
  const fx = setupSchedule();
  await fx.ctx.openProject('p1');
  const el = $(openScheduleEditor({ ctx: fx.ctx }).el);
  const form = el.querySelector('form');
  form.querySelector('[type="text"]').value = 'Demo';
  const [, , , , estimate, actual] = form.querySelectorAll('input');
  estimate.value = 'lots';
  actual.value = 'some';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(estimate.getAttribute('aria-invalid'), 'true');
  assert.equal(actual.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(fx.log, []);
  estimate.value = '1,250';
  actual.value = '';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['create Demo']);
  assert.equal(fx.items()[0].estimatedCents, 125000);
});

test('a failed create keeps the dialog open and reports', async () => {
  const fx = setupSchedule();
  await fx.ctx.openProject('p1');
  const el = $(openScheduleEditor({ ctx: fx.ctx }).el);
  const form = el.querySelector('form');
  form.querySelector('[type="text"]').value = 'boom';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(el.open, true);
  assert.deepEqual(fx.toasts, ['bad boom']);
  form.querySelector('[type="text"]').value = 'taken';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  const shown = form
    .querySelectorAll('.form__error')
    .filter((/** @type {any} */ e) => !e.hidden);
  assert.deepEqual(
    shown.map((/** @type {any} */ e) => e.textContent),
    ['title is taken'],
  );
  el.close();
});

test('editing shows tabs, logs a reason, and follows the payload', async () => {
  const fx = setupSchedule({
    schedule: [itemOf('a', { title: 'Demo', estimatedCents: 50000 })],
  });
  await fx.ctx.openProject('p1');
  const item = fx.items()[0];
  const dialog = openScheduleEditor({ ctx: fx.ctx, item, tab: 'changes' });
  const el = $(dialog.el);
  assert.equal(el.className, 'modal modal--wide');
  assert.equal(el.children[0].children[0].textContent, 'Demo');
  const tabButtons = el.querySelectorAll('[role="tab"]');
  assert.deepEqual(
    tabButtons.map((/** @type {any} */ b) => b.textContent),
    ['Details', 'Waits on', 'Notes', 'Changes'],
  );
  assert.equal(tabButtons[3].getAttribute('aria-selected'), 'true');
  const changes = el.querySelectorAll('[role="tabpanel"]')[3];
  assert.equal(changes.querySelector('.empty-state') !== null, true);
  const actions = el.children[2].children;
  assert.equal(actions[0].textContent, 'Delete');
  assert.equal(actions[0].classList.contains('editor__delete'), true);

  const form = el.querySelector('form');
  const reason = byId(form, form.id.replace('-form', '-reason'));
  assert.equal(
    reason.getAttribute('placeholder'),
    'Kept with each change in the log. Optional.',
  );
  const estimate = byId(form, form.id.replace('-form', '-estimate'));
  assert.equal(estimate.value, '500.00');
  estimate.value = '650';
  reason.value = 'Plumber quote came in higher';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['patch a Plumber quote came in higher']);
  assert.deepEqual(fx.toasts, ['ok Saved Demo']);
  assert.equal(el.open, false);

  // Reopen: the change log now has the row.
  const again = $(
    openScheduleEditor({ ctx: fx.ctx, item: fx.items()[0], tab: 'changes' }).el,
  );
  const entry = again.querySelector('.variance-entry');
  assert.equal(entry.children[1].children[0].textContent, 'Estimate');
  assert.equal(entry.children[1].children[1].textContent, '$500.00');
  assert.equal(entry.children[1].children[2].textContent, '$650.00');
  assert.equal(entry.children[2].textContent, 'Plumber quote came in higher');

  // A note written from the notes tab appears without reopening.
  const notesPanel = again.querySelectorAll('[role="tabpanel"]')[2];
  const composer = notesPanel.querySelector('form');
  composer.querySelector('textarea').value = 'Paid deposit';
  composer.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(
    notesPanel.querySelector('.note__body').textContent,
    'Paid deposit',
  );
  assert.equal(again.open, true);

  // The item vanishing closes the editor.
  await fx.ctx.write((api) => api.deleteScheduleItem('a'));
  assert.equal(again.open, false);
  assert.equal(dom.body.children.length, 0);
});

test('delete asks, then removes the item', async () => {
  const fx = setupSchedule({ schedule: [itemOf('a', { title: 'Demo' })] });
  await fx.ctx.openProject('p1');
  const el = $(openScheduleEditor({ ctx: fx.ctx, item: fx.items()[0] }).el);
  el.children[2].children[0].click();
  await tick();
  const confirm = $(dom.body.children[1]);
  assert.equal(confirm.children[0].textContent, 'Delete Demo?');
  confirm.children[2].children[0].click();
  await tick();
  assert.deepEqual(fx.log, []);
  el.children[2].children[0].click();
  await tick();
  $(dom.body.children[1]).children[2].children[1].click();
  await tick();
  assert.deepEqual(fx.log, ['delete a']);
  assert.deepEqual(fx.toasts, ['ok Deleted Demo']);
  assert.equal(el.open, false);
});

test('closing the project closes an open editor', async () => {
  const fx = setupSchedule({ schedule: [itemOf('a')] });
  await fx.ctx.openProject('p1');
  const el = $(openScheduleEditor({ ctx: fx.ctx, item: fx.items()[0] }).el);
  fx.ctx.closeProject();
  assert.equal(el.open, false);
});
