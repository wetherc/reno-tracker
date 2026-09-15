import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  deleteProject,
  getProject,
  getProjectPayload,
  listProjects,
  patchProject,
} from '../../../../src/server/repo/projects.js';
import { createNote } from '../../../../src/server/repo/notes.js';
import { createDependency } from '../../../../src/server/repo/dependencies.js';
import { createMaterialItem } from '../../../../src/server/repo/materials.js';
import { patchScheduleItem } from '../../../../src/server/repo/schedule.js';
import { materialItemDefaults } from '../../../../src/entities/materialItem.js';
import { addItem, freshDb, ISO_TIMESTAMP } from './fixtures.js';

test('createProject returns the stored row with a uuid and timestamp', () => {
  const { project } = freshDb();
  assert.match(project.id, /^[0-9a-f-]{36}$/);
  assert.match(project.createdAt, ISO_TIMESTAMP);
  assert.equal(project.budgetCents, 5_000_000);
});

test('listProjects returns newest first', () => {
  const { db } = freshDb();
  db.prepare(
    `UPDATE projects SET createdAt = '2020-01-01T00:00:00.000Z'`,
  ).run();
  createProject(db, { name: 'Bath', budgetCents: 0, startDate: '2026-02-01' });
  assert.deepEqual(
    listProjects(db).map((p) => p.name),
    ['Bath', 'Kitchen'],
  );
});

test('getProject throws 404 for an unknown id', () => {
  const { db } = freshDb();
  assert.throws(() => getProject(db, 'nope'), {
    status: 404,
    message: 'No project with id nope',
  });
});

test('patchProject writes only the given fields', () => {
  const { db, project } = freshDb();
  const after = patchProject(db, project.id, { budgetCents: 1 });
  assert.equal(after.budgetCents, 1);
  assert.equal(after.name, 'Kitchen');
  assert.deepEqual(patchProject(db, project.id, {}), after);
  assert.throws(() => patchProject(db, 'nope', { name: 'x' }), { status: 404 });
});

test('deleteProject cascades to every child table', () => {
  const { db, project } = freshDb();
  const a = addItem(db, project.id, 'Demo');
  const b = addItem(db, project.id, 'Framing');
  createDependency(db, project.id, { predecessorId: a.id, successorId: b.id });
  createNote(db, a.id, 'hello');
  patchScheduleItem(db, a.id, { title: 'Demolition' });
  createMaterialItem(
    db,
    project.id,
    materialItemDefaults({ name: 'Tile', scheduleItemId: a.id }),
  );
  deleteProject(db, project.id);
  for (const table of [
    'schedule_items',
    'dependencies',
    'notes',
    'variances',
    'material_items',
  ]) {
    assert.equal(
      db.prepare(`SELECT count(*) n FROM ${table}`).get()?.n,
      0,
      table,
    );
  }
  assert.throws(() => deleteProject(db, project.id), { status: 404 });
});

test('getProjectPayload gathers every child row in display order', () => {
  const { db, project } = freshDb();
  const b = addItem(db, project.id, 'Framing');
  const a = addItem(db, project.id, 'Demo');
  db.prepare('UPDATE schedule_items SET sortOrder = 0 WHERE id = ?').run(a.id);
  db.prepare('UPDATE schedule_items SET sortOrder = 1 WHERE id = ?').run(b.id);
  const dep = createDependency(db, project.id, {
    predecessorId: a.id,
    successorId: b.id,
  });
  const note = createNote(db, b.id, 'first');
  patchScheduleItem(db, a.id, { estimatedCents: 500 }, 'quote came in');
  const tile = createMaterialItem(
    db,
    project.id,
    materialItemDefaults({ name: 'Tile' }),
  );
  const payload = getProjectPayload(db, project.id);
  assert.deepEqual(payload.project, project);
  assert.deepEqual(
    payload.schedule.map((s) => s.title),
    ['Demo', 'Framing'],
  );
  assert.deepEqual(payload.dependencies, [dep]);
  assert.deepEqual(payload.notes, [note]);
  assert.deepEqual(payload.materials, [tile]);
  assert.equal(payload.variances.length, 1);
  assert.equal(payload.variances[0].reason, 'quote came in');
  assert.throws(() => getProjectPayload(db, 'nope'), { status: 404 });
});
