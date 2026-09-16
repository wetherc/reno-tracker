import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  connectorPath,
  daysDragged,
  ganttLayout,
  moveDates,
} from '../../../src/schedule/gantt.js';
import { itemOf } from '../app/scheduleFixtures.js';

const items = [
  itemOf('demo', {
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    sortOrder: 0,
  }),
  itemOf('plumb', {
    startDate: '2026-10-06',
    endDate: '2026-10-10',
    sortOrder: 2,
  }),
  itemOf('cabs', {
    startDate: '2026-10-08',
    endDate: '2026-10-17',
    sortOrder: 1,
  }),
];
const link = (
  /** @type {string} */ predecessorId,
  /** @type {string} */ successorId,
) => ({
  id: `${predecessorId}-${successorId}`,
  projectId: 'p1',
  predecessorId,
  successorId,
});

test('ganttLayout orders rows by start date, then end date, then sortOrder', () => {
  const layout = ganttLayout({
    items: [
      itemOf('late', {
        startDate: '2026-10-08',
        endDate: '2026-10-09',
        sortOrder: 0,
      }),
      itemOf('long', {
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        sortOrder: 1,
      }),
      itemOf('b', {
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        sortOrder: 3,
      }),
      itemOf('a', {
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        sortOrder: 2,
      }),
    ],
    dependencies: [],
    today: '2026-10-07',
  });
  assert.deepEqual(
    layout.rows.map((r) => r.item.id),
    ['a', 'b', 'long', 'late'],
  );
});

test('ganttLayout keeps a predecessor above a successor that starts earlier', () => {
  const layout = ganttLayout({
    items,
    dependencies: [link('cabs', 'plumb')],
    today: '2026-10-07',
    dayWidth: 10,
    rowHeight: 20,
  });
  assert.equal(layout.start, '2026-09-27');
  assert.equal(layout.end, '2026-10-24');
  assert.equal(layout.days, 28);
  assert.equal(layout.width, 280);
  assert.equal(layout.height, 60);
  assert.deepEqual(
    layout.rows.map((r) => r.item.id),
    ['demo', 'cabs', 'plumb'],
  );
  const cabs = layout.rows[1];
  assert.deepEqual([cabs.x, cabs.width, cabs.y], [110, 100, 20]);
  assert.deepEqual(layout.months, [
    { label: 'Sep 2026', x: 0, width: 40 },
    { label: 'Oct 2026', x: 40, width: 240 },
  ]);
  assert.deepEqual(
    layout.weeks.map((w) => w.x),
    [0, 70, 140, 210],
  );
  assert.equal(layout.weeks[1].date, '2026-10-04');
  assert.equal(layout.todayX, 105);
});

test('ganttLayout marks a successor that starts before its predecessor ends', () => {
  const layout = ganttLayout({
    items,
    dependencies: [
      link('demo', 'plumb'),
      link('plumb', 'cabs'),
      link('x', 'demo'),
    ],
    today: '2027-01-01',
    dayWidth: 10,
    rowHeight: 20,
  });
  assert.equal(layout.connectors.length, 2);
  const [clean, conflict] = layout.connectors;
  assert.equal(clean.conflict, false);
  assert.equal(clean.d, 'M70 10H78V30H90');
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.d, 'M140 30H148V40H102V50H110');
  assert.equal(layout.todayX, null);
});

test('ganttLayout with no items spans the week of today and the week after', () => {
  const layout = ganttLayout({
    items: [],
    dependencies: [],
    today: '2026-10-07',
  });
  assert.equal(layout.start, '2026-10-04');
  assert.equal(layout.end, '2026-10-17');
  assert.equal(layout.rows.length, 0);
  assert.equal(layout.height, 0);
  assert.equal(layout.todayX, 3 * 28 + 14);
});

test('connectorPath steps down the row boundary when going back', () => {
  const from = { item: items[0], x: 100, y: 40, width: 50 };
  const above = { item: items[1], x: 100, y: 0, width: 50 };
  assert.equal(connectorPath(from, above, 20), 'M150 50H158V20H92V10H100');
});

test('moveDates keeps one day and returns only changed fields', () => {
  const item = itemOf('a', { startDate: '2026-10-06', endDate: '2026-10-10' });
  assert.deepEqual(moveDates(item, 0, 'both'), {});
  assert.deepEqual(moveDates(item, 2, 'both'), {
    startDate: '2026-10-08',
    endDate: '2026-10-12',
  });
  assert.deepEqual(moveDates(item, -1, 'start'), { startDate: '2026-10-05' });
  assert.deepEqual(moveDates(item, 9, 'start'), { startDate: '2026-10-10' });
  assert.deepEqual(moveDates(item, 7, 'end'), { endDate: '2026-10-17' });
  assert.deepEqual(moveDates(item, -30, 'end'), { endDate: '2026-10-06' });
  const oneDay = itemOf('b', {
    startDate: '2026-10-06',
    endDate: '2026-10-06',
  });
  assert.deepEqual(moveDates(oneDay, 1, 'start'), {});
  assert.deepEqual(moveDates(oneDay, -1, 'end'), {});
});

test('daysDragged rounds to whole days', () => {
  assert.equal(daysDragged(13, 28), 0);
  assert.equal(daysDragged(15, 28), 1);
  assert.equal(daysDragged(-56, 28), -2);
});
