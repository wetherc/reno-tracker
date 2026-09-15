import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  addMonths,
  dayOffset,
  eachDay,
  gapDays,
  isIsoDate,
  monthBounds,
  monthOf,
  parseDate,
  sharedDays,
  spanDays,
  startOfWeek,
  toIsoDate,
  todayIso,
  weekday,
} from '../../../src/schedule/dates.js';

test('isIsoDate accepts real dates only', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(isIsoDate('2024-02-29'));
  assert.equal(isIsoDate('2023-02-29'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-1-5'), false);
  assert.equal(isIsoDate('2026-01-05T00:00'), false);
  assert.equal(isIsoDate(20260105), false);
  assert.equal(isIsoDate(null), false);
});

test('parseDate and toIsoDate round trip on UTC midnight', () => {
  const d = parseDate('2026-03-08');
  assert.equal(d.getUTCHours(), 0);
  assert.equal(toIsoDate(d), '2026-03-08');
});

test('addDays crosses month, year, and leap boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-08', 0), '2026-03-08');
});

test('spanDays is inclusive', () => {
  assert.equal(spanDays('2026-01-01', '2026-01-01'), 1);
  assert.equal(spanDays('2026-01-01', '2026-01-07'), 7);
  assert.equal(spanDays('2026-02-27', '2026-03-02'), 4);
});

test('todayIso uses the local calendar date', () => {
  const late = new Date(2026, 2, 8, 23, 30);
  assert.equal(todayIso(late), '2026-03-08');
  assert.equal(todayIso(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('gapDays counts free days and reports overlap as negative', () => {
  assert.equal(gapDays('2026-10-03', '2026-10-06'), 2);
  assert.equal(gapDays('2026-10-03', '2026-10-04'), 0);
  assert.equal(gapDays('2026-10-03', '2026-10-03'), -1);
  assert.equal(gapDays('2026-10-10', '2026-10-06'), -5);
});

test('monthOf, monthBounds, and addMonths', () => {
  assert.equal(monthOf('2026-10-15'), '2026-10');
  assert.deepEqual(monthBounds('2026-02'), {
    start: '2026-02-01',
    end: '2026-02-28',
  });
  assert.deepEqual(monthBounds('2024-02'), {
    start: '2024-02-01',
    end: '2024-02-29',
  });
  assert.deepEqual(monthBounds('2026-12'), {
    start: '2026-12-01',
    end: '2026-12-31',
  });
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-03', 0), '2026-03');
  assert.equal(addMonths('2026-03', 14), '2027-05');
});

test('weekday and startOfWeek use Sunday as the first day', () => {
  assert.equal(weekday('2026-09-13'), 0);
  assert.equal(weekday('2026-09-19'), 6);
  assert.equal(startOfWeek('2026-09-13'), '2026-09-13');
  assert.equal(startOfWeek('2026-09-19'), '2026-09-13');
  assert.equal(startOfWeek('2026-10-01'), '2026-09-27');
});

test('dayOffset is signed and eachDay is inclusive', () => {
  assert.equal(dayOffset('2026-10-01', '2026-10-01'), 0);
  assert.equal(dayOffset('2026-10-01', '2026-10-08'), 7);
  assert.equal(dayOffset('2026-10-08', '2026-10-01'), -7);
  assert.deepEqual(eachDay('2026-02-27', '2026-03-01'), [
    '2026-02-27',
    '2026-02-28',
    '2026-03-01',
  ]);
  assert.deepEqual(eachDay('2026-03-01', '2026-02-27'), []);
});

test('sharedDays returns the overlap or null', () => {
  const week = { start: '2026-10-04', end: '2026-10-10' };
  assert.deepEqual(
    sharedDays({ start: '2026-10-01', end: '2026-10-06' }, week),
    { start: '2026-10-04', end: '2026-10-06' },
  );
  assert.deepEqual(
    sharedDays({ start: '2026-10-08', end: '2026-10-20' }, week),
    { start: '2026-10-08', end: '2026-10-10' },
  );
  assert.deepEqual(
    sharedDays({ start: '2026-10-01', end: '2026-10-20' }, week),
    week,
  );
  assert.equal(
    sharedDays({ start: '2026-10-11', end: '2026-10-12' }, week),
    null,
  );
  assert.equal(
    sharedDays({ start: '2026-10-01', end: '2026-10-03' }, week),
    null,
  );
});
