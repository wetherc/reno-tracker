import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountSchedule } from '../../../src/app/schedule.js';
import {
  costVariance,
  revisedPrices,
  scheduleTotals,
  totalCostVariance,
  varianceCell,
} from '../../../src/app/scheduleTable.js';
import { mountShell } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import {
  changeOrderOf,
  itemOf,
  lineOf,
  setupSchedule,
  tick,
} from './scheduleFixtures.js';
import { approvedChanges } from '../../../src/costs/changed.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/**
 * @param {Parameters<typeof setupSchedule>[0]} [seed]
 * @param {Partial<Record<import('../../../src/storage/prefs.js').PrefKey, string>>} [saved] prefs written before the mount
 */
async function setup(seed, saved = {}) {
  const fx = setupSchedule(seed);
  for (const [key, value] of Object.entries(saved)) {
    fx.ctx.prefs.write(/** @type {any} */ (key), value);
  }
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
const table = (shell) => shell.body.children[1].children[0].children[0];
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
  assert.equal(totalCostVariance([itemOf('a'), itemOf('b')]), null);
  assert.equal(
    totalCostVariance([
      itemOf('a'),
      itemOf('b', { actualCents: 12000 }),
      itemOf('c', { actualCents: 9500 }),
    ]),
    1500,
  );
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
      'Blended',
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
    '$90.00$0.00 margin',
    '0',
  ]);
  const box = demo.children[0].children[0];
  assert.equal(box.getAttribute('type'), 'checkbox');
  assert.equal(box.checked, true);
  assert.equal(box.getAttribute('aria-label'), 'Demo complete');
  const title = demo.children[1].children[0].children[0];
  assert.equal(title.className, 'btn-bare schedule-title');
  assert.equal(title.children[0].getAttribute('aria-label'), 'Complete');
  assert.equal(cabinets.classList.contains('schedule-row--complete'), false);
  assert.equal(
    cabinets.children[0].children[0].getAttribute('aria-label'),
    'Cabinets complete',
  );
  assert.equal(cabinets.children[2].textContent, '—');
  assert.equal(cabinets.children[5].textContent, '7');
  assert.equal(cabinets.children[8].textContent, '—');
  assert.equal(
    cabinets.children[10].children[0].getAttribute('aria-label'),
    '2 notes on Cabinets',
  );
  const count = cabinets.children[10].children[0];
  assert.equal(count.className, 'btn-bare schedule-notes u-num');
  assert.equal(count.children[0].tagName, 'SVG');
  assert.equal(count.textContent, '2');
  const none = demo.children[10].children[0];
  assert.equal(none.className, 'btn-bare schedule-notes u-num u-muted');
  assert.equal(none.getAttribute('aria-label'), '0 notes on Demo');
  assert.equal(
    demo.children[3].className,
    'data-table__td data-table__td--nowrap',
  );
  const total = $(table(shell).children[3]).children[0];
  assert.deepEqual(
    total.children.map((/** @type {any} */ td) => td.textContent),
    [
      '',
      'Total',
      '',
      '',
      '',
      '10',
      '$200.00',
      '$90.00',
      '−$10.00',
      '$190.00$0.00 margin',
      '',
    ],
  );
});

test('scheduleTotals sums days and prices, skipping blank actuals', () => {
  assert.deepEqual(
    scheduleTotals([itemOf('a'), itemOf('b', { actualCents: 500 })], new Map()),
    { days: 6, estimatedCents: 20000, actualCents: 500 },
  );
  // Each row adds its approved change orders to the estimate total.
  const changes = approvedChanges([
    changeOrderOf('c', { lines: [lineOf({ scheduleItemId: 'b' }, 400)] }),
  ]);
  assert.equal(
    scheduleTotals([itemOf('a'), itemOf('b')], changes).estimatedCents,
    20400,
  );
  assert.deepEqual(revisedPrices(itemOf('b'), changes), {
    estimatedCents: 10400,
    actualCents: null,
  });
  assert.deepEqual(scheduleTotals([], new Map()), {
    days: 0,
    estimatedCents: 0,
    actualCents: 0,
  });
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
  demo.children[1].children[0].children[0].click();
  let dialog = $(dom.body.children[0]);
  assert.equal(
    dialog.querySelectorAll('[role="tab"]')[0].getAttribute('aria-selected'),
    'true',
  );
  dialog.close();
  demo.children[10].children[0].click();
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

test('every view id has a renderer', async () => {
  const { shell, ctx } = await setup({ schedule: [itemOf('a')] });
  ctx.prefs.write('lastView', 'agenda');
  const panel = mountSchedule({ ctx, shell });
  panel.show();
  const view = () => $(shell.body.children[1]).children[0];
  assert.equal(view().className, 'agenda');
  $(shell.tools.children[0]).children[0].click();
  assert.equal(view().className, 'table-scroll');
  assert.equal(view().children[0].tagName, 'TABLE');
});

test('the table opens in start date order', async (t) => {
  // Today before the items, so no title gets a late badge.
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 0, 15) });
  const { shell } = await setup({
    schedule: [
      itemOf('a', { title: 'Later', startDate: '2026-10-05' }),
      itemOf('b', { title: 'Sooner', startDate: '2026-10-02' }),
    ],
  });
  const titles = rows(shell).map(
    (/** @type {any} */ r) => r.children[1].textContent,
  );
  assert.deepEqual(titles, ['Sooner', 'Later']);
  const start = $(table(shell).children[1]).children[0].children[3];
  assert.equal(start.getAttribute('aria-sort'), 'ascending');
});

test('a chosen sort outlives the rebuild after a write', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 0, 15) });
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
  assert.equal(ctx.prefs.read('scheduleSort'), 'title:asc');
});

test('a saved sort opens the table in that order', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 0, 15) });
  const schedule = [
    itemOf('a', { title: 'Apple', startDate: '2026-10-02' }),
    itemOf('b', { title: 'Zinc', startDate: '2026-10-05' }),
  ];
  const { shell } = await setup({ schedule }, { scheduleSort: 'title:desc' });
  const titles = rows(shell).map(
    (/** @type {any} */ r) => r.children[1].textContent,
  );
  assert.deepEqual(titles, ['Zinc', 'Apple']);
  // Unreadable text falls back to date order.
  const fallback = await setup({ schedule }, { scheduleSort: 'title' });
  assert.deepEqual(
    rows(fallback.shell).map(
      (/** @type {any} */ r) => r.children[1].textContent,
    ),
    ['Apple', 'Zinc'],
  );
});

test('an open item past its end date is marked late', async () => {
  const { shell } = await setup({
    schedule: [
      itemOf('a', { title: 'Demo', endDate: '2020-01-02' }),
      itemOf('b', { title: 'Done', endDate: '2020-01-02', complete: true }),
      itemOf('c', { title: 'Soon', endDate: '2999-01-02' }),
    ],
  });
  const badges = rows(shell).map(
    (/** @type {any} */ tr) =>
      tr.children[1].querySelector('.badge')?.textContent,
  );
  assert.deepEqual(badges, ['Late', undefined, undefined]);
});

test('one note reads in the singular', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a', { title: 'Demo' })],
    notes: [
      {
        id: 'n1',
        scheduleItemId: 'a',
        body: 'x',
        createdAt: '',
        updatedAt: '',
      },
    ],
  });
  assert.equal(
    rows(shell)[0].children[10].children[0].getAttribute('aria-label'),
    '1 note on Demo',
  );
});

test('the Estimate column adds approved change orders and the variance reads it', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 0, 15) });
  const { shell } = await setup({
    schedule: [
      itemOf('a', { title: 'Demo', actualCents: 12500 }),
      itemOf('b', { title: 'Tile', startDate: '2026-10-02' }),
    ],
    changeOrders: [
      changeOrderOf('c', { lines: [lineOf({ scheduleItemId: 'a' }, 2000)] }),
    ],
  });
  const demo = rows(shell).find(
    (/** @type {any} */ r) => r.children[1].textContent === 'Demo',
  );
  assert.equal(demo.children[6].textContent, '$120.00+$20.00 change orders');
  assert.equal(demo.children[8].textContent, '+$5.00');
  const foot = $(table(shell).children[3]).children[0].children;
  assert.equal(foot[6].textContent, '$220.00');
  assert.equal(foot[8].textContent, '+$5.00');
  const heads = $(table(shell).children[1]).children[0].children;
  heads[6].children[0].click();
  assert.equal(rows(shell)[0].children[1].textContent, 'Tile');
  heads[8].children[0].click();
  assert.equal(rows(shell)[0].children[1].textContent, 'Tile');
});
