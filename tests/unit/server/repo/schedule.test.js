import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScheduleItem,
  deleteScheduleItem,
  getScheduleItem,
  patchScheduleItem,
  reorderSchedule,
  setScheduleItemComplete,
} from '../../../../src/server/repo/schedule.js';
import { scheduleItemDefaults } from '../../../../src/entities/scheduleItem.js';
import { getProjectPayload } from '../../../../src/server/repo/projects.js';
import { addItem, freshDb, ISO_TIMESTAMP } from './fixtures.js';

test('createScheduleItem appends to the end of the sort order', () => {
  const { db, project } = freshDb();
  const a = addItem(db, project.id, 'Demo');
  const b = addItem(db, project.id, 'Framing');
  assert.equal(a.sortOrder, 0);
  assert.equal(b.sortOrder, 1);
  assert.equal(a.complete, false);
  assert.equal(a.actualCents, null);
  assert.throws(
    () =>
      createScheduleItem(
        db,
        'nope',
        scheduleItemDefaults({ title: 'x', startDate: '2026-01-01' }),
      ),
    { status: 404 },
  );
});

test('patchScheduleItem logs one variance per changed tracked field with the reason', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo', { estimatedCents: 1000 });
  const after = patchScheduleItem(
    db,
    item.id,
    { endDate: '2026-01-12', estimatedCents: 1500, title: 'Demo' },
    'found asbestos',
  );
  assert.equal(after.endDate, '2026-01-12');
  assert.equal(after.estimatedCents, 1500);
  const variances = getProjectPayload(db, project.id).variances;
  assert.deepEqual(
    variances.map((v) => [v.kind, v.field, v.oldValue, v.newValue, v.reason]),
    [
      ['dates', 'endDate', '2026-01-09', '2026-01-12', 'found asbestos'],
      ['cost', 'estimatedCents', '1000', '1500', 'found asbestos'],
    ],
  );
  assert.match(variances[0].loggedAt, ISO_TIMESTAMP);
  assert.equal(variances[0].loggedAt, variances[1].loggedAt);
});

test('patchScheduleItem with no change writes nothing', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo');
  assert.deepEqual(patchScheduleItem(db, item.id, { title: 'Demo' }), item);
  assert.deepEqual(patchScheduleItem(db, item.id, {}), item);
  assert.equal(getProjectPayload(db, project.id).variances.length, 0);
  assert.throws(() => patchScheduleItem(db, 'nope', { title: 'x' }), {
    status: 404,
  });
});

test('a failed patch rolls back its variance rows', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo');
  assert.throws(() =>
    patchScheduleItem(
      db,
      item.id,
      /** @type {any} */ ({ title: 'New', bogus: 1 }),
    ),
  );
  assert.equal(getScheduleItem(db, item.id).title, 'Demo');
  assert.equal(getProjectPayload(db, project.id).variances.length, 0);
});

test('setScheduleItemComplete toggles without a variance', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo');
  assert.equal(setScheduleItemComplete(db, item.id, true).complete, true);
  assert.equal(setScheduleItemComplete(db, item.id, false).complete, false);
  assert.equal(getProjectPayload(db, project.id).variances.length, 0);
  assert.throws(() => setScheduleItemComplete(db, 'nope', true), {
    status: 404,
  });
});

test('deleteScheduleItem removes the row and unlinks materials', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo');
  db.prepare(
    `INSERT INTO material_items (id, projectId, scheduleItemId, name) VALUES ('m', ?, ?, 'Tile')`,
  ).run(project.id, item.id);
  deleteScheduleItem(db, item.id);
  assert.equal(
    db.prepare(`SELECT scheduleItemId FROM material_items WHERE id = 'm'`).get()
      ?.scheduleItemId,
    null,
  );
  assert.throws(() => deleteScheduleItem(db, item.id), { status: 404 });
});

test('reorderSchedule writes positions and rejects partial lists', () => {
  const { db, project } = freshDb();
  const a = addItem(db, project.id, 'Demo');
  const b = addItem(db, project.id, 'Framing');
  const c = addItem(db, project.id, 'Drywall');
  reorderSchedule(db, project.id, [c.id, a.id, b.id]);
  assert.deepEqual(
    getProjectPayload(db, project.id).schedule.map((s) => s.title),
    ['Drywall', 'Demo', 'Framing'],
  );
  assert.throws(() => reorderSchedule(db, project.id, [a.id, b.id]), {
    status: 400,
    field: 'ids',
  });
  assert.throws(() => reorderSchedule(db, project.id, [a.id, a.id, b.id]), {
    status: 400,
  });
  assert.throws(
    () => reorderSchedule(db, project.id, [a.id, b.id, c.id, 'zz']),
    { status: 400 },
  );
  assert.throws(() => reorderSchedule(db, 'nope', []), { status: 404 });
});
