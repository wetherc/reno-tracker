import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  chartRange,
  mountCosts,
  summaryTiles,
} from '../../../src/app/costs.js';
import { mountShell } from '../../../src/app/shell.js';
import { costSummary } from '../../../src/costs/summary.js';
import { todayIso } from '../../../src/schedule/dates.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, materialOf, setupSchedule } from './scheduleFixtures.js';

installDom();

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

test('mountCosts shows an empty state until something has a cost', async () => {
  const { shell } = await setup();
  assert.match(shell.body.textContent, /No costs in Kitchen yet/);
  assert.equal(shell.tools.children.length, 0);
});

test('mountCosts draws the tiles, both charts, and their table twins', async () => {
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
  assert.equal(cards.length, 2);
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
  const twin = cards[0].querySelector('table');
  assert.equal(twin.className, 'sr-only');
  assert.equal(twin.querySelectorAll('th').length, 6);
  const rows = $(twin.querySelector('tbody')).children;
  assert.equal(rows.length, 3);
  assert.equal(
    rows[0].textContent,
    'Oct 3, 2026Demo$1,000.00$1,100.00$1,000.00$1,100.00',
  );
  assert.equal(
    rows[2].textContent,
    'Nov 20, 2026Tile$2,500.00—$3,540.00$1,100.00',
  );

  assert.equal(
    cards[1].querySelector('.card__title').textContent,
    'Cost by month',
  );
  assert.equal(cards[1].querySelectorAll('.chart__expected-bar').length, 2);
  const monthRows = $(cards[1].querySelectorAll('td')).map(
    (/** @type {any} */ td) => td.textContent,
  );
  assert.deepEqual(monthRows, [
    'October 2026',
    '$1,000.00',
    '$1,100.00',
    'November 2026',
    '$2,540.00',
    '$0.00',
  ]);
});

test('mountCosts marks today when it is inside the range', async () => {
  const today = todayIso();
  const { shell } = await setup({
    schedule: [itemOf('a', { startDate: today, endDate: today })],
  });
  assert.ok(shell.body.querySelector('.chart__today'));
});
