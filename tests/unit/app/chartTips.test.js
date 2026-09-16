import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { markerTip, weekTip } from '../../../src/app/chartTips.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

const marker = {
  date: '2026-10-11',
  x: 0,
  y: 0,
  expectedCents: 300000,
  actualCents: null,
};
const events = /** @type {any} */ ([
  { title: 'Demo', expectedCents: 200000 },
  { title: 'Grout', expectedCents: 100000 },
]);

test('markerTip lists the rows that land and the running totals', () => {
  const tip = $(markerTip(marker, events, 500000));
  assert.equal(
    tip.querySelector('.chart-tip__date').textContent,
    'Sun, Oct 11, 2026',
  );
  assert.deepEqual(
    [...tip.querySelectorAll('.chart-tip__row')].map((li) => li.textContent),
    ['Demo$2,000.00', 'Grout$1,000.00'],
  );
  assert.deepEqual(
    [...tip.querySelectorAll('dt')].map((dt) => dt.textContent),
    ['Expected so far', 'Paid so far', 'Budget left'],
  );
  assert.deepEqual(
    [...tip.querySelectorAll('dd')].map((dd) => dd.textContent),
    ['$3,000.00', 'nothing yet', '$2,000.00'],
  );
  assert.deepEqual(
    [...tip.querySelectorAll('.cost-tile__mark')].map((m) => m.className),
    [
      'cost-tile__mark cost-tile__mark--expected',
      'cost-tile__mark cost-tile__mark--actual',
      'cost-tile__mark cost-tile__mark--budget',
    ],
  );
});

test('markerTip turns the budget line red once the total passes it', () => {
  const tip = $(markerTip({ ...marker, actualCents: 250000 }, events, 100000));
  const [, paid, over] = tip.querySelectorAll('dt');
  assert.equal(paid.textContent, 'Paid so far');
  assert.equal(over.textContent, 'Over budget');
  assert.equal(over.className, 'chart-tip__label chart-tip__label--over');
  const amounts = tip.querySelectorAll('dd');
  assert.equal(amounts[1].textContent, '$2,500.00');
  assert.equal(amounts[2].textContent, '$2,000.00');
  assert.equal(
    amounts[2].className,
    'chart-tip__amount chart-tip__amount--over',
  );
  assert.equal(tip.querySelectorAll('.cost-tile__mark').length, 2);
});

test('weekTip shows the two totals and no row list', () => {
  const tip = $(
    weekTip(
      /** @type {any} */ ({
        week: '2026-11-01',
        expectedCents: 40000,
        actualCents: 10000,
      }),
    ),
  );
  assert.equal(
    tip.querySelector('.chart-tip__date').textContent,
    'Week of Nov 1, 2026',
  );
  assert.equal(tip.querySelector('.chart-tip__rows'), null);
  assert.deepEqual(
    [...tip.querySelectorAll('dt')].map((dt) => dt.textContent),
    ['Estimate', 'Paid'],
  );
  assert.deepEqual(
    [...tip.querySelectorAll('dd')].map((dd) => dd.textContent),
    ['$400.00', '$100.00'],
  );
});
