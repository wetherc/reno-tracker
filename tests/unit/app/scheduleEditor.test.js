import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  describeLength,
  openScheduleEditor,
} from '../../../src/app/scheduleEditor.js';
import {
  changeOrderOf,
  invoiceOf,
  itemOf,
  lineOf,
  setupSchedule,
  tick,
} from './scheduleFixtures.js';

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
  const hint = form.querySelector('.form__hint');
  assert.equal(hint.textContent, '1 day');
  form.dispatchEvent({ type: 'submit' });
  await tick();
  const errors = form
    .querySelectorAll('.form__error')
    .filter((/** @type {any} */ e) => !e.hidden);
  assert.deepEqual(
    errors.map((/** @type {any} */ e) => e.textContent),
    ['Title cannot be blank'],
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
    /^End 2026-08-30 is before Start 2026-09-01$/,
  );
  assert.equal(document.activeElement, dates[1]);
  title.value = '';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(
    form
      .querySelectorAll('.form__error')
      .filter((/** @type {any} */ e) => !e.hidden).length,
    2,
    'every problem shows at once',
  );
  assert.equal(document.activeElement, title);
  title.value = ' Demo ';
  dates[1].value = '2026-09-04';
  dates[1].dispatchEvent({ type: 'input' });
  assert.equal(hint.textContent, '4 days');
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

test('the markup field sets a rate of the row and the line under the form follows it', async () => {
  const fx = setupSchedule({
    schedule: [itemOf('a', { title: 'Demo', estimatedCents: 10000 })],
    markupBasisPoints: 1000,
  });
  await fx.ctx.openProject('p1');
  const el = $(openScheduleEditor({ ctx: fx.ctx, item: fx.items()[0] }).el);
  const form = el.querySelector('form');
  const rate = form.querySelectorAll('input')[6];
  const line = form.querySelector('.editor__projection');
  assert.equal(rate.value, '');
  assert.equal(rate.placeholder, '10');
  assert.equal(
    line.textContent,
    'Projected $100.00 raw + $10.00 margin = $110.00 blended',
  );
  rate.value = '25';
  form.dispatchEvent({ type: 'input' });
  assert.equal(
    line.textContent,
    'Projected $100.00 raw + $25.00 margin = $125.00 blended',
  );
  rate.value = 'lots';
  form.dispatchEvent({ type: 'input' });
  assert.equal(line.textContent, '');
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(rate.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(fx.log, []);
  rate.value = '25';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(fx.items()[0].markupBasisPoints, 2500);
});

test('the projection line clears while a price does not parse', async () => {
  const fx = setupSchedule();
  await fx.ctx.openProject('p1');
  const el = $(openScheduleEditor({ ctx: fx.ctx }).el);
  const form = el.querySelector('form');
  const line = form.querySelector('.editor__projection');
  const [, , , , estimate, actual] = form.querySelectorAll('input');
  actual.value = 'some';
  form.dispatchEvent({ type: 'input' });
  assert.equal(line.textContent, '');
  actual.value = '50';
  estimate.value = 'lots';
  form.dispatchEvent({ type: 'input' });
  assert.equal(line.textContent, '');
  estimate.value = '100';
  form.dispatchEvent({ type: 'input' });
  assert.equal(
    line.textContent,
    'Projected $100.00 raw + $0.00 margin = $100.00 blended',
  );
  el.close();
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
    ['Title is taken'],
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
  assert.equal(changes.textContent, 'Loading changes');
  await tick();
  assert.match(changes.textContent, /^No changes logged/);
  const actions = el.children[2].children;
  assert.equal(actions[0].textContent, 'Delete');
  assert.equal(actions[0].classList.contains('editor__delete'), true);
  // Save and Cancel belong to the form, so the Changes tab hides them.
  assert.equal(actions[1].hidden, true);
  assert.equal(actions[2].hidden, true);
  tabButtons[0].click();
  assert.equal(actions[1].hidden, false);
  assert.equal(actions[2].hidden, false);

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
    openScheduleEditor({ ctx: fx.ctx, item: fx.items()[0], tab: 'details' }).el,
  );
  assert.equal(again.querySelector('.variance-entry'), null);
  again.querySelectorAll('[role="tab"]')[3].click();
  await tick();
  const entry = again.querySelector('.variance-entry');
  assert.equal(entry.children[1].children[0].textContent, 'Raw estimate');
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

test('describeLength counts the days or names an end before the start', () => {
  assert.equal(describeLength('2026-09-01', '2026-09-01'), '1 day');
  assert.equal(describeLength('2026-09-01', '2026-09-08'), '8 days');
  assert.equal(
    describeLength('2026-09-08', '2026-09-01'),
    'Ends before it starts',
  );
});

test('an edited form asks before it closes', async () => {
  const fx = setupSchedule({ schedule: [itemOf('a', { title: 'Demo' })] });
  await fx.ctx.openProject('p1');
  const dialog = openScheduleEditor({ ctx: fx.ctx, item: fx.items()[0] });
  const el = $(dialog.el);
  el.children[0].children[1].click();
  await tick();
  assert.equal(el.open, false);
  const again = openScheduleEditor({ ctx: fx.ctx, item: fx.items()[0] });
  $(again.el).querySelector('[type="text"]').value = 'Demo day';
  $(again.el).children[0].children[1].click();
  await tick();
  assert.equal(again.el.open, true);
  assert.equal(
    $(dom.body.children[1]).children[0].children[0].textContent,
    'Discard changes?',
  );
  $(dom.body.children[1]).children[2].children[1].click();
  await tick();
  assert.equal(again.el.open, false);
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

test('a note draft asks before the editor closes', async () => {
  const fx = setupSchedule({ schedule: [itemOf('a', { title: 'Demo' })] });
  await fx.ctx.openProject('p1');
  const dialog = openScheduleEditor({
    ctx: fx.ctx,
    item: fx.items()[0],
    tab: 'notes',
  });
  const el = $(dialog.el);
  el.querySelector('.notes').querySelector('textarea').value = 'Tile is late';
  el.children[0].children[1].click();
  await tick();
  assert.equal(el.open, true);
  const ask = $(dom.body.children[1]);
  assert.equal(ask.children[1].textContent, 'Some edits here are not saved.');
  ask.children[2].children[1].click();
  await tick();
  assert.equal(el.open, false);
});

test('a billed item shows its invoice sum read only and cannot be deleted', async () => {
  const fx = setupSchedule({
    schedule: [itemOf('a', { title: 'Demo', actualCents: 3 })],
    invoices: [
      invoiceOf('i1', {
        party: 'Wreckers',
        lines: [
          {
            id: 'l1',
            scheduleItemId: 'a',
            materialItemId: null,
            description: '',
            amountCents: 40000,
          },
        ],
      }),
    ],
  });
  await fx.ctx.openProject('p1');
  /** @type {any[]} */
  const patches = [];
  const patch = fx.ctx.api.patchScheduleItem;
  fx.ctx.api.patchScheduleItem = (id, body) => {
    patches.push(body);
    return patch(id, body);
  };
  const item = /** @type {any} */ (fx.ctx.payload).schedule[0];
  const dialog = openScheduleEditor({ ctx: fx.ctx, item });
  const form = $(dialog.el).querySelector('form');
  const actual = form.querySelectorAll('[inputmode="decimal"]')[1];
  assert.equal(actual.value, '400.00');
  assert.equal(actual.hasAttribute('readonly'), true);
  $(dialog.el).children[2].children[0].click();
  await tick();
  assert.equal(
    fx.toasts.at(-1),
    'bad An invoice from Wreckers bills Demo. Remove that line first.',
  );
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal('actualCents' in patches[0], false);
  assert.deepEqual(fx.log, ['patch a ']);
});

test('an item keeps its typed estimate, names its change orders, and cannot be deleted', async () => {
  const fx = setupSchedule({
    schedule: [itemOf('a', { title: 'Demo', estimatedCents: 10000 })],
    changeOrders: [
      changeOrderOf('c1', {
        number: '4',
        party: 'Wreckers',
        markupBasisPoints: 1000,
        lines: [
          lineOf({ scheduleItemId: 'a' }, 2000),
          lineOf({ scheduleItemId: 'a' }, 500),
        ],
      }),
    ],
  });
  await fx.ctx.openProject('p1');
  /** @type {any[]} */
  const patches = [];
  const patch = fx.ctx.api.patchScheduleItem;
  fx.ctx.api.patchScheduleItem = (id, body) => {
    patches.push(body);
    return patch(id, body);
  };
  const item = /** @type {any} */ (fx.ctx.payload).schedule[0];
  const dialog = openScheduleEditor({ ctx: fx.ctx, item });
  const form = $(dialog.el).querySelector('form');
  const estimate = form.querySelectorAll('[inputmode="decimal"]')[0];
  assert.equal(estimate.value, '100.00');
  assert.equal(
    form.querySelector(`#${estimate.getAttribute('aria-describedby')}`)
      .textContent,
    'Plus $25.00 from 2 approved change order lines, before $2.50 markup',
  );
  assert.equal(
    form.querySelector('.editor__projection').textContent,
    'Projected $125.00 raw + $2.50 margin = $127.50 blended',
  );
  $(dialog.el).children[2].children[0].click();
  await tick();
  assert.equal(
    fx.toasts.at(-1),
    'bad Change order 4 from Wreckers adds to Demo. Remove that line first.',
  );
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(patches[0].estimatedCents, 10000);
});
