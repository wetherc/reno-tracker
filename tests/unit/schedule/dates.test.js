import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  gapDays,
  isIsoDate,
  parseDate,
  spanDays,
  toIsoDate,
  todayIso,
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
