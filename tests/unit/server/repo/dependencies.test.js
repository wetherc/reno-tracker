import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDependency,
  deleteDependency,
  listDependencies,
} from '../../../../src/server/repo/dependencies.js';
import { createProject } from '../../../../src/server/repo/projects.js';
import { addItem, freshDb } from './fixtures.js';

test('createDependency stores the edge and rejects a duplicate', () => {
  const { db, project } = freshDb();
  const a = addItem(db, project.id, 'Demo');
  const b = addItem(db, project.id, 'Framing');
  const dep = createDependency(db, project.id, {
    predecessorId: a.id,
    successorId: b.id,
  });
  assert.deepEqual(listDependencies(db, project.id), [dep]);
  assert.throws(
    () =>
      createDependency(db, project.id, {
        predecessorId: a.id,
        successorId: b.id,
      }),
    {
      status: 409,
      message: 'Framing already depends on Demo',
      field: 'predecessorId',
    },
  );
});

test('createDependency names the loop by title', () => {
  const { db, project } = freshDb();
  const a = addItem(db, project.id, 'Demo');
  const b = addItem(db, project.id, 'Framing');
  const c = addItem(db, project.id, 'Drywall');
  createDependency(db, project.id, { predecessorId: a.id, successorId: b.id });
  createDependency(db, project.id, { predecessorId: b.id, successorId: c.id });
  assert.throws(
    () =>
      createDependency(db, project.id, {
        predecessorId: c.id,
        successorId: a.id,
      }),
    {
      status: 409,
      message:
        'This dependency makes a loop: Demo -> Framing -> Drywall -> Demo',
    },
  );
  assert.throws(
    () =>
      createDependency(db, project.id, {
        predecessorId: a.id,
        successorId: a.id,
      }),
    { status: 409, message: 'This dependency makes a loop: Demo -> Demo' },
  );
});

test('createDependency keeps edges inside one project', () => {
  const { db, project } = freshDb();
  const other = createProject(db, {
    name: 'Bath',
    budgetCents: 0,
    startDate: '2026-01-01',
  });
  const a = addItem(db, project.id, 'Demo');
  const x = addItem(db, other.id, 'Tile');
  assert.throws(
    () =>
      createDependency(db, project.id, {
        predecessorId: x.id,
        successorId: a.id,
      }),
    { status: 400, field: 'predecessorId' },
  );
  assert.throws(
    () =>
      createDependency(db, project.id, {
        predecessorId: a.id,
        successorId: x.id,
      }),
    { status: 400, field: 'successorId' },
  );
  assert.throws(
    () =>
      createDependency(db, project.id, {
        predecessorId: 'nope',
        successorId: a.id,
      }),
    { status: 404 },
  );
});

test('deleteDependency removes the edge once', () => {
  const { db, project } = freshDb();
  const a = addItem(db, project.id, 'Demo');
  const b = addItem(db, project.id, 'Framing');
  const dep = createDependency(db, project.id, {
    predecessorId: a.id,
    successorId: b.id,
  });
  deleteDependency(db, dep.id);
  assert.deepEqual(listDependencies(db, project.id), []);
  assert.throws(() => deleteDependency(db, dep.id), { status: 404 });
});
