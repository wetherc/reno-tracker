import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProjectPayload,
  listProjects,
} from '../../../src/local/projects.js';
import { emptyDb } from '../../../src/local/store.js';

/** @param {string} id @param {string} name @param {string} createdAt */
const project = (id, name, createdAt) => ({
  id,
  name,
  budgetCents: 0,
  startDate: '2026-01-01',
  createdAt,
});

/** @param {string} id @param {string} title @param {number} sortOrder @param {string} [startDate] */
const item = (id, title, sortOrder, startDate = '2026-01-01') => ({
  id,
  projectId: 'p',
  title,
  description: '',
  startDate,
  endDate: startDate,
  responsibleParty: '',
  estimatedCents: 0,
  actualCents: null,
  complete: false,
  sortOrder,
});

test('projects list newest first and by name within one moment', () => {
  const db = emptyDb();
  db.projects.push(
    project('a', 'Kitchen', '2026-01-01T00:00:00.000Z'),
    project('b', 'Deck', '2026-01-02T00:00:00.000Z'),
    project('c', 'Bath', '2026-01-02T00:00:00.000Z'),
  );
  assert.deepEqual(
    listProjects(db).map((p) => p.name),
    ['Bath', 'Deck', 'Kitchen'],
  );
});

test('payload rows sort by order, then date, then name', () => {
  const db = emptyDb();
  db.projects.push(project('p', 'Kitchen', '2026-01-01T00:00:00.000Z'));
  db.schedule.push(
    item('s1', 'Zinc', 1),
    item('s2', 'Alpha', 1),
    item('s3', 'Late', 0, '2026-02-01'),
    item('s4', 'Early', 0),
  );
  db.materials.push(
    {
      id: 'm1',
      projectId: 'p',
      scheduleItemId: null,
      name: 'Tile',
      allowanceCents: 0,
      estimatedCents: 0,
      actualCents: null,
      complete: false,
      expectedDate: null,
      sortOrder: 0,
    },
    {
      id: 'm2',
      projectId: 'p',
      scheduleItemId: null,
      name: 'Grout',
      allowanceCents: 0,
      estimatedCents: 0,
      actualCents: null,
      complete: false,
      expectedDate: null,
      sortOrder: 0,
    },
  );
  const payload = getProjectPayload(db, 'p');
  assert.deepEqual(
    payload.schedule.map((s) => s.title),
    ['Early', 'Late', 'Alpha', 'Zinc'],
  );
  assert.deepEqual(
    payload.materials.map((m) => m.name),
    ['Grout', 'Tile'],
  );
});
