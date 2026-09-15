import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMaterialItem,
  deleteMaterialItem,
  getMaterialItem,
  patchMaterialItem,
  reorderMaterials,
  setMaterialItemComplete,
} from '../../../../src/server/repo/materials.js';
import {
  createProject,
  getProjectPayload,
} from '../../../../src/server/repo/projects.js';
import { materialItemDefaults } from '../../../../src/entities/materialItem.js';
import { addItem, freshDb } from './fixtures.js';

/** @param {import('node:sqlite').DatabaseSync} db @param {string} projectId @param {string} name @param {import('../../../../src/types.ts').MaterialItemInput} [extra] */
const addMaterial = (db, projectId, name, extra = {}) =>
  createMaterialItem(db, projectId, materialItemDefaults({ name, ...extra }));

test('createMaterialItem appends and links to a schedule item of the same project', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo');
  const a = addMaterial(db, project.id, 'Tile', {
    scheduleItemId: item.id,
    allowanceCents: 10,
  });
  const b = addMaterial(db, project.id, 'Grout');
  assert.equal(a.sortOrder, 0);
  assert.equal(b.sortOrder, 1);
  assert.equal(a.scheduleItemId, item.id);
  assert.equal(b.scheduleItemId, null);
  assert.equal(a.complete, false);
  const other = createProject(db, {
    name: 'Bath',
    budgetCents: 0,
    startDate: '2026-01-01',
  });
  assert.throws(
    () => addMaterial(db, other.id, 'Sink', { scheduleItemId: item.id }),
    {
      status: 400,
      field: 'scheduleItemId',
    },
  );
  assert.throws(() => addMaterial(db, 'nope', 'x'), { status: 404 });
  assert.throws(
    () => addMaterial(db, project.id, 'x', { scheduleItemId: 'nope' }),
    { status: 404 },
  );
});

test('patchMaterialItem, complete, delete', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo');
  const m = addMaterial(db, project.id, 'Tile');
  const patched = patchMaterialItem(db, m.id, {
    scheduleItemId: item.id,
    actualCents: 999,
  });
  assert.equal(patched.scheduleItemId, item.id);
  assert.equal(patched.actualCents, 999);
  assert.deepEqual(patchMaterialItem(db, m.id, {}), patched);
  assert.equal(
    patchMaterialItem(db, m.id, { scheduleItemId: null }).scheduleItemId,
    null,
  );
  assert.equal(setMaterialItemComplete(db, m.id, true).complete, true);
  assert.deepEqual(getMaterialItem(db, m.id).complete, true);
  deleteMaterialItem(db, m.id);
  assert.throws(() => getMaterialItem(db, m.id), {
    status: 404,
    message: `No material item with id ${m.id}`,
  });
  assert.throws(() => deleteMaterialItem(db, m.id), { status: 404 });
  assert.throws(() => patchMaterialItem(db, m.id, {}), { status: 404 });
  assert.throws(() => setMaterialItemComplete(db, m.id, true), { status: 404 });
});

test('reorderMaterials writes positions', () => {
  const { db, project } = freshDb();
  const a = addMaterial(db, project.id, 'Tile');
  const b = addMaterial(db, project.id, 'Grout');
  reorderMaterials(db, project.id, [b.id, a.id]);
  assert.deepEqual(
    getProjectPayload(db, project.id).materials.map((m) => m.name),
    ['Grout', 'Tile'],
  );
  assert.throws(() => reorderMaterials(db, project.id, [a.id]), {
    status: 400,
  });
  assert.throws(() => reorderMaterials(db, 'nope', []), { status: 404 });
});
