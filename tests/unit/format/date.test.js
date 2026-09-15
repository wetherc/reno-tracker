import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDate,
  formatDayMonth,
  formatMonth,
  formatRange,
  formatMoment,
  formatWeekday,
  formatDayLong,
} from '../../../src/format/date.js';

test('formatDate shows the calendar day in UTC', () => {
  assert.equal(formatDate('2026-10-01'), 'Oct 1, 2026');
  assert.equal(formatDate('2024-02-29'), 'Feb 29, 2024');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(''), '—');
});

test('formatDayMonth drops the year', () => {
  assert.equal(formatDayMonth('2026-12-31'), 'Dec 31');
});

test('formatMoment includes a time', () => {
  const text = formatMoment('2026-10-01T15:04:00.000Z');
  assert.match(text, /2026/);
  assert.match(text, /\d{1,2}:\d{2}/);
});

test('formatMonth names the month and year', () => {
  assert.equal(formatMonth('2026-10'), 'October 2026');
  assert.equal(formatMonth('2024-02'), 'February 2024');
});

test('formatRange collapses a one-day range', () => {
  assert.equal(formatRange('2026-10-13', '2026-10-15'), 'Oct 13 to Oct 15');
  assert.equal(formatRange('2026-10-13', '2026-10-13'), 'Oct 13');
});

test('formatWeekday and formatDayLong read the day in UTC', () => {
  assert.equal(formatWeekday('2026-10-13'), 'Tue');
  assert.equal(formatWeekday('2026-10-18'), 'Sun');
  assert.equal(formatDayLong('2026-10-13'), 'Tuesday, October 13, 2026');
});
