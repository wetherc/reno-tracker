import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountSchedule } from '../../../src/app/schedule.js';
import { costVariance, varianceCell } from '../../../src/app/scheduleTable.js';
import { mountShell } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, setupSchedule, tick } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {Parameters<typeof setupSchedule>[0]} [seed] */
async function setup(seed) {
  const fx = setupSchedule(seed);
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountSchedule({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  return { ...fx, shell, panel };
}

/** @param {any} shell */
const table = (shell) => shell.body.children[0];
/** @param {any} shell */
const rows = (shell) => $(table(shell).children[2]).children;

test('costVariance and varianceCell', () => {
  assert.equal(costVariance(itemOf('a')), null);
  assert.equal(costVariance(itemOf('a', { actualCents: 12000 })), 2000);
  assert.equal(varianceCell(null).textContent, '—');
  const over = varianceCell(2000);
  assert.equal(over.className, 'variance--over');
  assert.equal(over.textContent, '+$20.00');
  const under = varianceCell(-500);
  assert.equal(under.className, 'variance--under');
  assert.equal(under.textContent, '−$5.00');
  assert.equal(varianceCell(0).textContent, '$0.00');
});

test('show does nothing without a project', () => {
  const fx = setupSchedule();
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  mountSchedule({ ctx: fx.ctx, shell }).show();
  assert.equal(shell.body.children.length, 0);
});

test('an empty schedule invites the first item', async () => {
  const { shell } = await setup();
  assert.equal(shell.tools.children[0].getAttribute('aria-label'), 'View');
  assert.equal(shell.tools.children[1].textContent, 'Add item');
  const empty = $(shell.body.children[0]);
  assert.equal(empty.className, 'empty-state u-muted');
  assert.match(empty.textContent, /Nothing scheduled for Kitchen yet/);
  empty.children[1].click();
  assert.equal(dom.body.children[0].tagName, 'DIALOG');
  $(dom.body.children[0]).close();
});

test('the table has one row per item with the planned columns', async () => {
  const { shell } = await setup({
    schedule: [
      itemOf('a', {
        title: 'Demo',
        responsibleParty: 'Crew',
        actualCents: 9000,
        complete: true,
      }),
      itemOf('b', {
        title: 'Cabinets',
        startDate: '2026-10-04',
        endDate: '2026-10-10',
      }),
    ],
    notes: [
      {
        id: 'n1',
        scheduleItemId: 'b',
        body: 'x',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'n2',
        scheduleItemId: 'b',
        body: 'y',
        createdAt: '',
        updatedAt: '',
      },
    ],
  });
  const heads = $(table(shell).children[1]).children[0].children;
  assert.deepEqual(
    heads.map((/** @type {any} */ th) => th.textContent),
    [
      'Done',
      'Item',
      'Who',
      'Start',
      'End',
      'Days',
      'Estimate',
      'Actual',
      'Variance',
      'Notes',
    ],
  );
  const [demo, cabinets] = rows(shell);
  assert.equal(demo.classList.contains('schedule-row--complete'), true);
  const cells = demo.children.map((/** @type {any} */ td) => td.textContent);
  assert.deepEqual(cells.slice(2), [
    'Crew',
    'Oct 1',
    'Oct 3',
    '3',
    '$100.00',
    '$90.00',
    '−$10.00',
    '0',
  ]);
  const box = demo.children[0].children[0];
  assert.equal(box.getAttribute('type'), 'checkbox');
  assert.equal(box.checked, true);
  assert.equal(box.getAttribute('aria-label'), 'Reopen Demo');
  const title = demo.children[1].children[0];
  assert.equal(title.className, 'btn-bare schedule-title');
  assert.equal(title.children[0].getAttribute('aria-label'), 'Complete');
  assert.equal(cabinets.classList.contains('schedule-row--complete'), false);
  assert.equal(
    cabinets.children[0].children[0].getAttribute('aria-label'),
    'Mark Cabinets complete',
  );
  assert.equal(cabinets.children[2].textContent, '—');
  assert.equal(cabinets.children[5].textContent, '7');
  assert.equal(cabinets.children[8].textContent, '—');
  assert.equal(
    cabinets.children[9].children[0].getAttribute('aria-label'),
    '2 notes on Cabinets',
  );
});

test('the checkbox writes complete and rolls back on failure', async () => {
  const { shell, log, toasts, items } = await setup({
    schedule: [
      itemOf('a', { title: 'Demo' }),
      itemOf('stuck', { title: 'Stuck' }),
    ],
  });
  let [demo] = rows(shell);
  const box = demo.children[0].children[0];
  box.checked = true;
  box.dispatchEvent({ type: 'change' });
  assert.equal(box.disabled, true);
  await tick();
  assert.deepEqual(log, ['complete a true']);
  assert.deepEqual(toasts, ['ok Marked Demo complete']);
  assert.equal(items()[0].complete, true);
  let stuck;
  [demo, stuck] = rows(shell);
  assert.equal(demo.children[0].children[0].checked, true);
  const stuckBox = stuck.children[0].children[0];
  stuckBox.checked = true;
  stuckBox.dispatchEvent({ type: 'change' });
  await tick();
  assert.equal(stuckBox.checked, false);
  assert.equal(stuckBox.disabled, false);
  assert.deepEqual(toasts.at(-1), 'bad stuck');
  demo.children[0].children[0].checked = false;
  demo.children[0].children[0].dispatchEvent({ type: 'change' });
  await tick();
  assert.deepEqual(toasts.at(-1), 'ok Reopened Demo');
});

test('title and notes count open the editor on the right tab', async () => {
  const { shell } = await setup({ schedule: [itemOf('a', { title: 'Demo' })] });
  const [demo] = rows(shell);
  demo.children[1].children[0].click();
  let dialog = $(dom.body.children[0]);
  assert.equal(
    dialog.querySelectorAll('[role="tab"]')[0].getAttribute('aria-selected'),
    'true',
  );
  dialog.close();
  demo.children[9].children[0].click();
  dialog = $(dom.body.children[0]);
  assert.equal(
    dialog.querySelectorAll('[role="tab"]')[2].getAttribute('aria-selected'),
    'true',
  );
  dialog.close();
  $(shell.tools.children[1]).click();
  dialog = $(dom.body.children[0]);
  assert.equal(dialog.children[0].children[0].textContent, 'New schedule item');
  dialog.close();
});

test('a view that is not built yet says so', async () => {
  const { shell, ctx } = await setup({ schedule: [itemOf('a')] });
  ctx.prefs.write('lastView', 'agenda');
  const panel = mountSchedule({ ctx, shell });
  panel.show();
  assert.equal(
    shell.body.children[0].textContent,
    'The Agenda view is not built yet.',
  );
  $(shell.tools.children[0]).children[0].click();
  assert.equal(shell.body.children[0].tagName, 'TABLE');
});

test('a chosen sort outlives the rebuild after a write', async () => {
  const { shell, ctx } = await setup({
    schedule: [
      itemOf('a', { title: 'Zinc', estimatedCents: 300 }),
      itemOf('b', { title: 'Apple', estimatedCents: 100 }),
    ],
  });
  const heads = $(table(shell).children[1]).children[0].children;
  heads[1].children[0].click();
  const titles = () =>
    rows(shell).map((/** @type {any} */ r) => r.children[1].textContent);
  assert.deepEqual(titles(), ['Apple', 'Zinc']);
  await ctx.write((api) => api.setScheduleComplete('a', true));
  assert.deepEqual(titles(), ['Apple', 'Zinc']);
  assert.equal(
    $(table(shell).children[1]).children[0].children[1].getAttribute(
      'aria-sort',
    ),
    'ascending',
  );
});
