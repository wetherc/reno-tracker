import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LANES,
  monthGrid,
  startingMonth,
  weekRow,
} from '../../../src/schedule/calendar.js';
import { itemOf } from '../app/scheduleFixtures.js';

test('monthGrid covers whole weeks and marks days outside the month', () => {
  const grid = monthGrid('2026-10', []);
  assert.equal(grid.start, '2026-10-01');
  assert.equal(grid.end, '2026-10-31');
  assert.equal(grid.weeks.length, 5);
  assert.equal(grid.weeks[0].start, '2026-09-27');
  assert.deepEqual(
    grid.weeks[0].days.map((d) => d.inMonth),
    [false, false, false, false, true, true, true],
  );
  const last = grid.weeks[4];
  assert.equal(last.days[6].date, '2026-10-31');
  assert.equal(last.days[6].inMonth, true);
  assert.equal(monthGrid('2026-11', []).weeks[4].days[6].date, '2026-12-05');
  assert.deepEqual(last.hidden, [0, 0, 0, 0, 0, 0, 0]);
});

test('monthGrid handles a six-week month and a leap February', () => {
  assert.equal(monthGrid('2026-05', []).weeks.length, 6);
  const feb = monthGrid('2032-02', []);
  assert.equal(feb.weeks.length, 5);
  assert.equal(feb.end, '2032-02-29');
  // A February that starts on Sunday with 28 days fills exactly 4 weeks.
  assert.equal(monthGrid('2026-02', []).weeks.length, 4);
});

test('weekRow clips bars to the week and flags continuation', () => {
  const items = [
    itemOf('a', { startDate: '2026-10-01', endDate: '2026-10-03' }),
    itemOf('b', { startDate: '2026-09-28', endDate: '2026-10-20' }),
    itemOf('c', { startDate: '2026-10-11', endDate: '2026-10-12' }),
  ];
  const week = weekRow('2026-09-27', '2026-10', items);
  assert.equal(week.bars.length, 2);
  const [b, a] = week.bars;
  assert.equal(b.item.id, 'b');
  assert.deepEqual(
    [b.startCol, b.endCol, b.lane, b.continuesBefore, b.continuesAfter],
    [1, 6, 0, false, true],
  );
  assert.equal(a.item.id, 'a');
  assert.deepEqual(
    [a.startCol, a.endCol, a.lane, a.continuesBefore, a.continuesAfter],
    [4, 6, 1, false, false],
  );
  const next = weekRow('2026-10-04', '2026-10', items);
  assert.equal(next.bars.length, 1);
  assert.equal(next.bars[0].continuesBefore, true);
  assert.equal(next.bars[0].continuesAfter, true);
});

test('weekRow reuses a lane once the earlier bar has ended', () => {
  const items = [
    itemOf('a', { startDate: '2026-10-04', endDate: '2026-10-05' }),
    itemOf('b', { startDate: '2026-10-04', endDate: '2026-10-10' }),
    itemOf('c', { startDate: '2026-10-06', endDate: '2026-10-07' }),
  ];
  const week = weekRow('2026-10-04', '2026-10', items);
  const lanes = Object.fromEntries(
    week.bars.map((bar) => [bar.item.id, bar.lane]),
  );
  // b is longer so it takes lane 0. a takes lane 1 and c reuses it.
  assert.deepEqual(lanes, { b: 0, a: 1, c: 1 });
});

test('weekRow hides bars past the lane limit and counts them per day', () => {
  const items = Array.from({ length: MAX_LANES + 2 }, (_, i) =>
    itemOf(`i${i}`, { startDate: '2026-10-05', endDate: '2026-10-06' }),
  );
  items.push(
    itemOf('late', { startDate: '2026-10-09', endDate: '2026-10-10' }),
  );
  const week = weekRow('2026-10-04', '2026-10', items);
  assert.equal(week.bars.length, MAX_LANES + 1);
  assert.deepEqual(
    week.bars.map((b) => b.item.id),
    ['i0', 'i1', 'i2', 'late'],
  );
  assert.deepEqual(week.hidden, [0, 2, 2, 0, 0, 0, 0]);
});

test('startingMonth prefers the month with live work', () => {
  const items = [
    itemOf('a', { startDate: '2026-10-01', endDate: '2026-10-03' }),
    itemOf('b', { startDate: '2026-12-01', endDate: '2026-12-05' }),
  ];
  assert.equal(startingMonth(items, '2026-12-20', '2026-01-01'), '2026-12');
  assert.equal(startingMonth(items, '2026-11-15', '2026-01-01'), '2026-10');
  assert.equal(startingMonth([], '2026-11-15', '2026-09-01'), '2026-09');
});
