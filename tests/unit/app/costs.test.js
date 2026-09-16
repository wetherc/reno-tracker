import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  chartRange,
  describeMarker,
  describeWeek,
  markerTargets,
  weekTargets,
  mountCosts,
  summaryTiles,
} from '../../../src/app/costs.js';
import { barChartModel } from '../../../src/charts/barChart.js';
import { lineChartModel } from '../../../src/charts/lineChart.js';
import { mountShell } from '../../../src/app/shell.js';
import { costSummary } from '../../../src/costs/summary.js';
import { todayIso } from '../../../src/schedule/dates.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, materialOf, setupSchedule } from './scheduleFixtures.js';

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
  const panel = mountCosts({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  return { ...fx, shell, panel };
}

const payload = /** @type {any} */ ({ project: { startDate: '2026-09-01' } });
/** @param {string} date */
const at = (date) => /** @type {any} */ ({ date });

test('chartRange runs from the earlier of start and first cost to a week past the later of last cost and today', () => {
  assert.deepEqual(
    chartRange(payload, [at('2026-10-01'), at('2026-11-05')], '2026-10-20'),
    { start: '2026-09-01', end: '2026-11-12' },
  );
  assert.deepEqual(
    chartRange(payload, [at('2026-08-15'), at('2026-09-05')], '2026-10-20'),
    { start: '2026-08-15', end: '2026-10-27' },
  );
  assert.deepEqual(chartRange(payload, [], '2026-05-01'), {
    start: '2026-09-01',
    end: '2026-09-08',
  });
});

test('summaryTiles names the five numbers and flips the remaining tile when over', () => {
  const under = summaryTiles(
    costSummary(
      [
        {
          id: 'a',
          source: 'schedule',
          title: 'a',
          date: '2026-10-01',
          complete: true,
          expectedCents: 10000,
          actualCents: 12000,
        },
      ],
      50000,
    ),
  );
  assert.deepEqual(
    under.map((t) => [t.label, t.value, t.mark ?? null, t.over ?? false]),
    [
      ['Budget', '$500.00', 'budget', false],
      ['Committed', '$100.00', 'expected', false],
      ['Spent', '$120.00', 'actual', false],
      ['Remaining', '$380.00', null, false],
      ['Complete', '100%', null, false],
    ],
  );
  assert.equal(under[3].note, '$120.00 projected');
  const over = summaryTiles(costSummary([], -5000));
  assert.equal(over[3].label, 'Over budget');
  assert.equal(over[3].value, '$50.00');
  assert.equal(over[3].over, true);
});

test('describeMarker and describeMonth read one mark out in words', () => {
  const marker = {
    date: '2026-10-03',
    x: 0,
    y: 0,
    expectedCents: 100000,
    actualCents: null,
  };
  assert.equal(
    describeMarker(marker, ['Demo', 'Grout'], 500000),
    'Oct 3, 2026 · Demo, Grout · $1,000.00 expected so far · nothing paid yet · $4,000.00 of budget left',
  );
  assert.equal(
    describeMarker({ ...marker, actualCents: 110000 }, ['Demo'], 90000),
    'Oct 3, 2026 · Demo · $1,000.00 expected so far · $1,100.00 paid so far · $100.00 over budget',
  );
  assert.equal(
    describeWeek({
      week: '2026-10-04',
      label: 'Oct 4',
      x: 0,
      width: 0,
      expectedY: 0,
      expectedHeight: 0,
      actualY: 0,
      actualHeight: 0,
      expectedCents: 250000,
      actualCents: 0,
    }),
    'Week of Oct 4, 2026 · $2,500.00 expected · $0.00 paid',
  );
});

test('markerTargets and weekTargets place a target on each mark, in percent', () => {
  const events = /** @type {any} */ ([
    { date: '2026-10-11', title: 'Demo' },
    { date: '2026-10-11', title: 'Grout' },
    { date: '2026-10-21', title: 'Tile' },
  ]);
  const line = lineChartModel({
    expected: [
      { date: '2026-10-11', cents: 20000 },
      { date: '2026-10-21', cents: 50000 },
    ],
    actual: [],
    budgetCents: 80000,
    start: '2026-10-01',
    end: '2026-11-20',
    today: '2026-10-31',
    width: 356,
    height: 140,
  });
  const svg = $(document.createElement('svg'));
  const dot = $(document.createElement('circle'));
  dot.setAttribute('data-date', '2026-10-21');
  svg.append(dot);
  const dots = markerTargets(line, events, 80000, svg);
  assert.equal(dots.length, 2);
  assert.match(dots[0].text, /^Oct 11, 2026 · Demo, Grout · /);
  assert.deepEqual([dots[0].left, dots[0].top], [31.69, 62.14]);
  assert.equal(dots[0].width, undefined);
  dots[1].highlight?.(true);
  assert.equal(dot.className, 'chart__marker--active');
  dots[1].highlight?.(false);
  assert.equal(dot.className, '');
  dots[0].highlight?.(true);

  const bars = barChartModel({
    weeks: [
      { week: '2026-11-01', expectedCents: 40000, actualCents: 10000 },
      { week: '2026-11-08', expectedCents: 0, actualCents: 0 },
    ],
    width: 372,
    height: 140,
  });
  const columns = weekTargets(bars, svg);
  assert.deepEqual(
    columns.map((c) => [c.left, c.top, c.width, c.height]),
    [
      [15.05, 8.57, 40.32, 71.43],
      [55.38, 8.57, 40.32, 71.43],
    ],
  );
  assert.equal(
    columns[1].text,
    'Week of Nov 8, 2026 · $0.00 expected · $0.00 paid',
  );
  assert.deepEqual(weekTargets(barChartModel({ weeks: [] }), svg), []);
});

test('mountCosts shows an empty state until something has a cost', async () => {
  const { shell } = await setup();
  assert.match(shell.body.textContent, /No costs in Kitchen yet/);
  assert.equal(shell.tools.children.length, 0);
});

test('mountCosts draws the tiles, both charts, and the line items', async () => {
  const { shell } = await setup({
    schedule: [
      itemOf('a', {
        title: 'Demo',
        endDate: '2026-10-03',
        estimatedCents: 100000,
        actualCents: 110000,
        complete: true,
      }),
      itemOf('b', {
        title: 'Tile',
        endDate: '2026-11-20',
        estimatedCents: 250000,
      }),
    ],
    materials: [
      materialOf('m', {
        name: 'Grout',
        expectedDate: '2026-11-02',
        estimatedCents: 4000,
      }),
    ],
  });
  const root = shell.body.children[0];
  assert.equal(root.className, 'costs');
  const tiles = $(root.querySelectorAll('.cost-tile'));
  assert.equal(tiles.length, 5);
  assert.equal(tiles[0].textContent, 'Budget$50,000.00');
  assert.equal(
    tiles[1].querySelector('.cost-tile__mark').className,
    'cost-tile__mark cost-tile__mark--expected',
  );
  assert.equal(
    tiles[3].querySelector('.cost-tile__value').textContent,
    '$46,360.00',
  );
  assert.equal(tiles[4].querySelector('.cost-tile__value').textContent, '33%');

  const cards = $(root.querySelectorAll('.cost-card'));
  assert.equal(cards.length, 3);
  assert.equal(
    cards[0].querySelector('.card__title').textContent,
    'Cost over time',
  );
  assert.equal(
    cards[0].querySelector('title').textContent,
    'Cumulative cost of Kitchen',
  );
  assert.ok(cards[0].querySelector('.chart__expected'));
  assert.ok(cards[0].querySelector('.chart__actual'));
  assert.equal(cards[0].querySelector('table'), null);
  const picker = cards[0].querySelector('.chart-picker');
  assert.equal(picker.children.length, 3);
  assert.match(
    picker.children[0].getAttribute('aria-label'),
    /^Oct 3, 2026 · Demo/,
  );
  const readout = cards[0].querySelector('.chart-readout');
  assert.match(readout.textContent, /Point at or tab/);
  picker.children[0].dispatchEvent({ type: 'pointerenter' });
  assert.match(readout.textContent, /\$1,100\.00 paid so far/);
  assert.equal(
    cards[0].querySelector('.chart__marker').className,
    'chart__marker chart__marker--active',
  );
  // Oct 3 to Nov 20 covers eight Sundays, Sep 27 through Nov 15.
  assert.equal(cards[1].querySelector('.chart-picker').children.length, 8);

  assert.equal(
    cards[1].querySelector('.card__title').textContent,
    'Cost by week',
  );
  assert.equal(cards[1].querySelectorAll('.chart__expected-bar').length, 8);
  const key = cards[1].querySelector('.chart-legend');
  assert.equal(key.getAttribute('aria-label'), 'Key');
  assert.deepEqual(
    key.children.map((/** @type {any} */ li) => li.textContent),
    ['Estimate', 'Paid on finished rows'],
  );
  assert.equal(cards[0].querySelector('.chart-legend'), null);
  const twin = cards[1].querySelector('table');
  assert.equal(twin.className, 'sr-only');
  const weekRows = $(twin.querySelectorAll('td')).map(
    (/** @type {any} */ td) => td.textContent,
  );
  assert.equal(weekRows.length, 24);
  assert.deepEqual(weekRows.slice(0, 3), [
    'Sep 27, 2026',
    '$1,000.00',
    '$1,100.00',
  ]);
  assert.deepEqual(weekRows.slice(15, 18), ['Nov 1, 2026', '$40.00', '$0.00']);
  assert.deepEqual(weekRows.slice(21), ['Nov 15, 2026', '$2,500.00', '$0.00']);

  assert.equal(
    cards[2].querySelector('.card__title').textContent,
    'Line items',
  );
  const items = cards[2].querySelector('table');
  assert.equal(items.className, 'data-table');
  const rows = $(items.querySelector('tbody')).children;
  assert.equal(rows.length, 3);
  assert.equal(
    rows[0].textContent,
    'Demo' + 'Labor' + 'Oct 3' + '$1,000.00' + '$1,100.00' + '+$100.00',
  );
  assert.ok(rows[0].classList.contains('cost-row--complete'));
  assert.equal(
    rows[0].children[0].children[0].getAttribute('aria-label'),
    'Done',
  );
  assert.equal(
    rows[1].textContent,
    'Grout' + 'Material' + 'Nov 2' + '$40.00' + '—' + '—',
  );
  assert.equal(rows[2].children[0].textContent, '');
  const total = $(items.querySelector('tfoot')).children[0];
  assert.equal(total.textContent, 'Total$3,540.00$1,100.00+$100.00');
  const accrued = cards[2].querySelector('.cost-accrued');
  assert.equal(
    accrued.textContent,
    'Incurred, not invoiced' + '0 finished rows with no actual yet' + '$0.00',
  );
});

test('a line item opens the editor of the row behind it', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a', { title: 'Demo', estimatedCents: 100 })],
    materials: [materialOf('m', { name: 'Grout' })],
  });
  const names = $(shell.body.querySelectorAll('.cost-item'));
  assert.equal(names.length, 2);
  /** @param {string} text */
  const named = (text) =>
    names.find((/** @type {any} */ n) => n.textContent === text);
  const lastDialog = () => $(dom.body.children[dom.body.children.length - 1]);
  named('Demo').click();
  let dialog = lastDialog();
  assert.equal(dialog.tagName, 'DIALOG');
  assert.equal(dialog.children[0].children[0].textContent, 'Demo');
  dialog.close();
  named('Grout').click();
  dialog = lastDialog();
  assert.equal(dialog.children[0].children[0].textContent, 'Grout');
  dialog.close();
});

test('mountCosts marks today when it is inside the range', async () => {
  const today = todayIso();
  const { shell } = await setup({
    schedule: [itemOf('a', { startDate: today, endDate: today })],
  });
  assert.ok(shell.body.querySelector('.chart__today'));
});

test('mountCosts sums the finished rows that have no actual price yet', async () => {
  const { shell } = await setup({
    schedule: [
      itemOf('a', { title: 'Demo', estimatedCents: 352500, complete: true }),
      itemOf('b', { title: 'Tile', estimatedCents: 100000 }),
    ],
  });
  const accrued = $(shell.body.querySelector('.cost-accrued'));
  assert.equal(
    accrued.textContent,
    'Incurred, not invoiced' +
      '1 finished row with no actual yet' +
      '$3,525.00',
  );
});
