import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  byMonth,
  costEvents,
  cumulative,
  landingDate,
  materialExpected,
} from '../../../src/costs/timeline.js';
import { itemOf, materialOf } from '../app/scheduleFixtures.js';

const payload = /** @type {any} */ ({
  project: { startDate: '2026-09-01', budgetCents: 100000 },
  schedule: [
    itemOf('b', { endDate: '2026-10-20', estimatedCents: 30000 }),
    itemOf('a', {
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      estimatedCents: 10000,
      actualCents: 12000,
      complete: true,
    }),
  ],
  materials: [
    materialOf('m1', { expectedDate: '2026-12-02', estimatedCents: 5000 }),
    materialOf('m2', {
      scheduleItemId: 'a',
      estimatedCents: 2000,
      actualCents: 1500,
      complete: true,
    }),
    materialOf('m3', { estimatedCents: 700, complete: true }),
  ],
});

test('materialExpected falls back to the allowance when no estimate is entered', () => {
  assert.equal(materialExpected(materialOf('x')), 12000);
  assert.equal(materialExpected(materialOf('x', { estimatedCents: 0 })), 10000);
  assert.equal(
    materialExpected(materialOf('x', { estimatedCents: 0, allowanceCents: 0 })),
    0,
  );
});

test('landingDate follows the expected date, then the item, then the project', () => {
  assert.deepEqual(landingDate(payload.materials[0], payload), {
    date: '2026-12-02',
    inferred: false,
  });
  assert.deepEqual(landingDate(payload.materials[1], payload), {
    date: '2026-10-01',
    inferred: true,
  });
  assert.deepEqual(landingDate(payload.materials[2], payload), {
    date: '2026-09-01',
    inferred: true,
  });
});

test('costEvents lands each row on one day in date order', () => {
  const events = costEvents(payload);
  assert.deepEqual(
    events.map((e) => [e.id, e.source, e.date, e.expectedCents, e.actualCents]),
    [
      ['m3', 'material', '2026-09-01', 700, null],
      ['m2', 'material', '2026-10-01', 2000, 1500],
      ['a', 'schedule', '2026-10-03', 10000, 12000],
      ['b', 'schedule', '2026-10-20', 30000, null],
      ['m1', 'material', '2026-12-02', 5000, null],
    ],
  );
  assert.equal(events[0].title, 'Material m3');
  assert.equal(events[0].complete, true);
  assert.equal(events[3].complete, false);
});

test('cumulative sums by day and skips rows with no value', () => {
  const events = costEvents(payload);
  assert.deepEqual(cumulative(events, 'expectedCents'), [
    { date: '2026-09-01', cents: 700 },
    { date: '2026-10-01', cents: 2700 },
    { date: '2026-10-03', cents: 12700 },
    { date: '2026-10-20', cents: 42700 },
    { date: '2026-12-02', cents: 47700 },
  ]);
  assert.deepEqual(cumulative(events, 'actualCents'), [
    { date: '2026-10-01', cents: 1500 },
    { date: '2026-10-03', cents: 13500 },
  ]);
  assert.deepEqual(cumulative([], 'expectedCents'), []);
});

test('cumulative merges two costs on the same day into one point', () => {
  const twice = costEvents({
    ...payload,
    materials: [],
    schedule: [
      itemOf('x', { endDate: '2026-10-03', estimatedCents: 100 }),
      itemOf('y', { endDate: '2026-10-03', estimatedCents: 250 }),
    ],
  });
  assert.deepEqual(cumulative(twice, 'expectedCents'), [
    { date: '2026-10-03', cents: 350 },
  ]);
});

test('byMonth fills the empty months between the first and the last', () => {
  assert.deepEqual(byMonth(costEvents(payload)), [
    { month: '2026-09', expectedCents: 700, actualCents: 0 },
    { month: '2026-10', expectedCents: 42000, actualCents: 13500 },
    { month: '2026-11', expectedCents: 0, actualCents: 0 },
    { month: '2026-12', expectedCents: 5000, actualCents: 0 },
  ]);
  assert.deepEqual(byMonth([]), []);
});
