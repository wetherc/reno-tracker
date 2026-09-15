import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDate,
  formatDayMonth,
  formatMoment,
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
