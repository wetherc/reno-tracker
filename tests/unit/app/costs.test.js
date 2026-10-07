import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  chartRange,
  chartWidth,
  describeMarker,
  describeWeek,
  markerTargets,
  weekTargets,
  mountCosts,
  materialsNote,
  summaryTiles,
} from '../../../src/app/costs.js';
import { barChartModel } from '../../../src/charts/barChart.js';
import { lineChartModel } from '../../../src/charts/lineChart.js';
import { mountShell } from '../../../src/app/shell.js';
import { costSummary } from '../../../src/costs/summary.js';
import { todayIso } from '../../../src/schedule/dates.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import {
  invoiceOf,
  itemOf,
  lineOf,
  materialOf,
  setupSchedule,
} from './scheduleFixtures.js';

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

test('chartRange runs from the earlier of start and first cost to a week past the last cost', () => {
  assert.deepEqual(chartRange(payload, [at('2026-10-01'), at('2026-11-05')]), {
    start: '2026-09-01',
    end: '2026-11-12',
  });
  assert.deepEqual(chartRange(payload, [at('2026-08-15'), at('2026-09-05')]), {
    start: '2026-08-15',
    end: '2026-09-12',
  });
  assert.deepEqual(chartRange(payload, []), {
    start: '2026-09-01',
    end: '2026-09-08',
  });
  // The cost events and invoice events come in two sorted runs.
  assert.deepEqual(
    chartRange(payload, [
      at('2026-10-01'),
      at('2026-08-20'),
      at('2026-11-05'),
      at('2026-10-10'),
    ]),
    { start: '2026-08-20', end: '2026-11-12' },
  );
});

test('chartRange does not stretch the axis to today when the last cost is in the past', () => {
  const past = /** @type {any} */ ({ project: { startDate: '2025-01-01' } });
  assert.deepEqual(chartRange(past, [at('2025-02-01'), at('2025-03-01')]), {
    start: '2025-01-01',
    end: '2025-03-08',
  });
});

test('summaryTiles names the seven numbers and flips the headroom tile when over', () => {
  const done = {
    percentWork: 40,
    workdaysDone: 2,
    workdaysAll: 5,
    percentMaterials: 100,
    materialsBought: 2,
    materialsAll: 2,
    materialsUninvoiced: 1,
  };
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
          expectedMarkupCents: 0,
          invoicedCents: 12000,
          billedCents: 12000,
          billedMarkupCents: 0,
        },
      ],
      50000,
    ),
    done,
  );
  assert.deepEqual(
    under.map((t) => [t.label, t.value, t.mark ?? null, t.over ?? false]),
    [
      ['Budget', '$500.00', 'budget', false],
      ['Committed', '$100.00', 'expected', false],
      ['Spent', '$120.00', 'actual', false],
      ['Projected', '$120.00', null, false],
      ['Budget headroom', '$380.00', null, false],
      ['Work done', '40%', null, false],
      ['Materials bought', '100%', null, false],
    ],
  );
  assert.equal(under[1].note, 'every estimate, before invoices');
  assert.equal(under[2].note, 'every invoice, paid or not');
  assert.equal(under[3].note, 'invoiced price, else estimate');
  assert.equal(under[4].note, 'budget minus projected');
  assert.equal(under[5].note, '2 of 5 workdays done');
  assert.equal(under[6].note, '2 of 2 bought, 1 not yet invoiced');
  assert.equal(
    materialsNote({ ...done, materialsUninvoiced: 0 }),
    '2 of 2 bought',
  );
  const marked = summaryTiles(
    { ...costSummary([], 0), projectedCents: 11_500, markupCents: 1_500 },
    done,
  );
  assert.deepEqual(
    [marked[3].label, marked[3].value, marked[3].note],
    ['Projected', '$115.00', '$100.00 base + $15.00 markup'],
  );
  assert.equal(marked.length, 7);
  const over = summaryTiles(costSummary([], -5000), done);
  assert.equal(over[4].label, 'Over budget');
  assert.equal(over[4].value, '$50.00');
  assert.equal(over[4].over, true);
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
    'Oct 3, 2026 · Demo, Grout · $1,000.00 expected so far · nothing invoiced yet · $4,000.00 budget less expected',
  );
  assert.equal(
    describeMarker({ ...marker, actualCents: 110000 }, ['Demo'], 90000),
    'Oct 3, 2026 · Demo · $1,000.00 expected so far · $1,100.00 invoiced so far · $100.00 expected over budget',
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
    'Week of Oct 4, 2026 · $2,500.00 expected · $0.00 invoiced',
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
    actual: [{ date: '2026-10-15', cents: 7000 }],
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
  const issued = [
    { id: 'i', title: 'Invoice 7', date: '2026-10-15', cents: 7000 },
  ];
  const dots = markerTargets(line, events, issued, 80000, svg);
  assert.equal(dots.length, 3);
  assert.match(dots[0].text, /^Oct 11, 2026 · Demo, Grout · /);
  // A day with only an invoice on it names the invoice.
  assert.match(
    dots[1].text,
    /^Oct 15, 2026 · Invoice 7 · .* · \$70\.00 invoiced so far/,
  );
  assert.equal(
    $(dots[1].detail?.()).querySelector('.chart-tip__row').textContent,
    'Invoice 7$70.00',
  );
  assert.deepEqual([dots[0].left, dots[0].top], [31.69, 58.86]);
  assert.equal(dots[0].width, undefined);
  dots[2].highlight?.(true);
  assert.equal(dot.className, 'chart__mark--active');
  dots[2].highlight?.(false);
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
      [15.05, 8.57, 40.32, 62.86],
      [55.38, 8.57, 40.32, 62.86],
    ],
  );
  assert.equal(
    columns[1].text,
    'Week of Nov 8, 2026 · $0.00 expected · $0.00 invoiced',
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
        startDate: '2026-10-05',
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
    invoices: [
      invoiceOf('i', {
        issuedDate: '2026-10-03',
        lines: [lineOf({ scheduleItemId: 'a' }, 110000)],
      }),
    ],
  });
  const root = shell.body.children[0];
  assert.equal(root.className, 'costs');
  const tiles = $(root.querySelectorAll('.cost-tile'));
  assert.equal(tiles.length, 7);
  assert.equal(tiles[0].textContent, 'Budget$50,000.00');
  assert.equal(
    tiles[1].querySelector('.cost-tile__mark').className,
    'cost-tile__mark cost-tile__mark--expected',
  );
  assert.equal(
    tiles[4].querySelector('.cost-tile__value').textContent,
    '$46,360.00',
  );
  // Demo runs 2 of the 37 workdays; Grout is not bought.
  assert.equal(tiles[5].querySelector('.cost-tile__value').textContent, '5%');
  assert.equal(tiles[6].querySelector('.cost-tile__value').textContent, '0%');

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
  // Three targets and the callout box.
  const picker = cards[0].querySelector('.chart-picker');
  assert.equal(picker.children.length, 4);
  assert.match(
    picker.children[0].getAttribute('aria-label'),
    /^Oct 3, 2026 · Demo/,
  );
  assert.equal(cards[0].querySelector('.chart-readout'), null);
  assert.match(
    picker.children[0].getAttribute('aria-label'),
    /\$1,100\.00 invoiced so far/,
  );
  picker.children[0].dispatchEvent({ type: 'pointerenter' });
  assert.equal(
    cards[0].querySelector('.chart__mark').className,
    'chart__mark chart__mark--active',
  );
  const tip = cards[0].querySelector('.chart-tip');
  assert.equal(tip.hidden, false);
  assert.equal(
    tip.querySelector('.chart-tip__date').textContent,
    'Sat, Oct 3, 2026',
  );
  // Oct 3 to Nov 20 covers eight Sundays, Sep 27 through Nov 15, plus
  // the callout box.
  assert.equal(cards[1].querySelector('.chart-picker').children.length, 9);

  assert.equal(
    cards[1].querySelector('.card__title').textContent,
    'Cost by week',
  );
  assert.equal(cards[1].querySelectorAll('.chart__expected-bar').length, 8);
  const key = cards[1].querySelector('.chart-legend');
  assert.equal(key.getAttribute('aria-label'), 'Key');
  assert.deepEqual(
    key.children.map((/** @type {any} */ li) => li.textContent),
    ['Estimate', 'Invoiced'],
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
    'Demo' +
      'Labor' +
      'Oct 3' +
      '$1,000.00' +
      '$1,100.00' +
      '$1,100.00$0.00 margin' +
      '+$100.00',
  );
  assert.ok(rows[0].classList.contains('cost-row--complete'));
  assert.equal(
    rows[0].children[0].children[0].getAttribute('aria-label'),
    'Done',
  );
  assert.equal(
    rows[1].textContent,
    'Grout' +
      'Material' +
      'Nov 2' +
      '$40.00' +
      '—' +
      '$40.00$0.00 margin' +
      '—',
  );
  assert.equal(rows[2].children[0].textContent, '');
  const total = $(items.querySelector('tfoot')).children[0];
  assert.equal(
    total.textContent,
    'Total$3,540.00$1,100.00$3,640.00$0.00 margin+$100.00',
  );
  const accrued = cards[2].querySelector('.cost-accrued');
  assert.equal(
    accrued.textContent,
    'Incurred, not invoiced' + '0 finished rows with no invoice yet' + '$0.00',
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

test('mountCosts sums the finished rows that no invoice bills', async () => {
  const { shell } = await setup({
    schedule: [
      itemOf('a', { title: 'Demo', estimatedCents: 352500, complete: true }),
      itemOf('b', { title: 'Tile', estimatedCents: 100000 }),
      // A typed price is not an invoice, and it counts in place of the
      // estimate.
      itemOf('c', {
        title: 'Trim',
        estimatedCents: 9000,
        actualCents: 2000,
        complete: true,
      }),
    ],
  });
  const accrued = $(shell.body.querySelector('.cost-accrued'));
  assert.equal(
    accrued.textContent,
    'Incurred, not invoiced' +
      '2 finished rows with no invoice yet' +
      '$3,545.00',
  );
});

test('mountCosts counts every invoice in Spent on the day it was issued', async () => {
  const { shell } = await setup({
    markupBasisPoints: 1000,
    schedule: [
      itemOf('b', {
        title: 'Tile',
        startDate: '2026-10-05',
        endDate: '2026-11-20',
        estimatedCents: 250000,
      }),
    ],
    invoices: [
      invoiceOf('i', {
        issuedDate: '2026-09-20',
        markupBasisPoints: 1000,
        lines: [lineOf({ scheduleItemId: 'b' }, 50000)],
      }),
    ],
  });
  const tiles = $(shell.body.querySelectorAll('.cost-tile')).map(
    (/** @type {any} */ t) => t.textContent,
  );
  // The deposit on an open row is spent, with its markup.
  assert.equal(tiles[2], 'Spent$550.00every invoice, paid or not');
  const items = $(shell.body.querySelector('.data-table'));
  const row = items.querySelector('tbody').children[0];
  assert.equal(
    row.textContent,
    'Tile' +
      'Labor' +
      'Nov 20' +
      '$2,750.00' +
      '$550.00' +
      '$2,750.00$250.00 margin' +
      '$0.00',
  );
  const picker = $(shell.body.querySelector('.chart-picker'));
  assert.match(
    picker.children[0].getAttribute('aria-label'),
    /^Sep 20, 2026 · An invoice from Party i · \$0\.00 expected so far · \$550\.00 invoiced so far/,
  );
});

test('mountCosts adds the project markup and says so under the line items', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a', { title: 'Demo', estimatedCents: 100000 })],
    markupBasisPoints: 1500,
  });
  const tile = $(shell.body)
    .querySelectorAll('.cost-tile')
    .map((/** @type {any} */ t) => t.textContent)
    .find((/** @type {string} */ t) => t.startsWith('Projected'));
  assert.equal(tile, 'Projected$1,150.00$1,000.00 base + $150.00 markup');
  assert.match(
    $(shell.body.querySelector('.cost-markup-note')).textContent,
    /^Every amount here includes the markup/,
  );
});

test('mountCosts has no markup note with no markup', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a', { estimatedCents: 100000 })],
  });
  assert.equal(shell.body.querySelector('.cost-markup-note'), null);
});

test('the line items sort by each money column', async () => {
  const { shell } = await setup({
    schedule: [
      itemOf('a', { title: 'Demo', estimatedCents: 1000, complete: true }),
      itemOf('b', { title: 'Tile', estimatedCents: 5000, actualCents: 9000 }),
      itemOf('c', { title: 'Trim', estimatedCents: 3000 }),
    ],
    invoices: [
      invoiceOf('i', { lines: [lineOf({ scheduleItemId: 'c' }, 2000)] }),
    ],
  });
  const items = () => $(shell.body.querySelector('.data-table'));
  const names = () =>
    items()
      .querySelector('tbody')
      .children.map((/** @type {any} */ r) => r.children[1].textContent);
  /** @param {string} label */
  const sortBy = (label) =>
    items()
      .children[1].children[0].children.find(
        (/** @type {any} */ th) => th.textContent === label,
      )
      .children[0].click();
  sortBy('Invoiced');
  assert.deepEqual(names(), ['Demo', 'Tile', 'Trim']);
  sortBy('Blended');
  assert.deepEqual(names(), ['Demo', 'Trim', 'Tile']);
  // Tile runs $40 over its estimate, and Trim has an invoice below its
  // open estimate, so it counts the estimate.
  sortBy('Vs estimate');
  assert.deepEqual(names(), ['Demo', 'Trim', 'Tile']);
});

test('chartWidth draws a narrow model under the breakpoint', () => {
  /** @param {boolean} matches */
  const win = (matches) => ({ matchMedia: () => ({ matches }) });
  assert.equal(chartWidth(win(true)), 480);
  assert.equal(chartWidth(win(false)), 960);
  assert.equal(chartWidth({}), 960);
  assert.equal(chartWidth(), 960);
});
