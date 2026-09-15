import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaDays, dayFor } from '../../../src/schedule/agenda.js';
import { itemOf } from '../app/scheduleFixtures.js';

const items = [
  itemOf('b', { startDate: '2026-10-01', endDate: '2026-10-03', sortOrder: 1 }),
  itemOf('a', { startDate: '2026-10-01', endDate: '2026-10-01', sortOrder: 1 }),
  itemOf('c', {
    startDate: '2026-10-03',
    endDate: '2026-10-09',
    sortOrder: 0,
    complete: true,
  }),
];

test('agendaDays groups by start and end date in order', () => {
  const days = agendaDays(items);
  assert.deepEqual(
    days.map((d) => d.date),
    ['2026-10-01', '2026-10-03', '2026-10-09'],
  );
  assert.deepEqual(
    days[0].starting.map((i) => i.id),
    ['a', 'b'],
  );
  assert.deepEqual(days[0].finishing, []);
  assert.deepEqual(
    days[1].starting.map((i) => i.id),
    ['c'],
  );
  assert.deepEqual(
    days[1].finishing.map((i) => i.id),
    ['b'],
  );
  assert.deepEqual(
    days[2].finishing.map((i) => i.id),
    ['c'],
  );
});

test('agendaDays can hide complete items', () => {
  const days = agendaDays(items, { hideComplete: true });
  assert.deepEqual(
    days.map((d) => d.date),
    ['2026-10-01', '2026-10-03'],
  );
  assert.deepEqual(days[1].starting, []);
  assert.deepEqual(agendaDays([]), []);
});

test('dayFor picks the latest day on or before the date', () => {
  const days = agendaDays(items);
  assert.equal(dayFor(days, '2026-10-05')?.date, '2026-10-03');
  assert.equal(dayFor(days, '2026-10-03')?.date, '2026-10-03');
  assert.equal(dayFor(days, '2026-09-01')?.date, '2026-10-01');
  assert.equal(dayFor([], '2026-09-01'), null);
});
