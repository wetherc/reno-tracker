import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalApi } from '../../../src/local/api.js';
import { memoryStorage } from '../../../src/storage/prefs.js';

function setup() {
  const storage = memoryStorage();
  const api = createLocalApi(storage);
  /** @param {string} name @param {string} [startDate] */
  const project = (name = 'Kitchen', startDate = '2026-01-05') =>
    api.createProject({ name, startDate, budgetCents: 100_000 });
  /** @param {string} projectId @param {string} title @param {Record<string, unknown>} [extra] */
  const item = (projectId, title, extra = {}) =>
    api.createScheduleItem(projectId, {
      title,
      startDate: '2026-01-05',
      endDate: '2026-01-09',
      ...extra,
    });
  return { api, storage, project, item };
}

/**
 * @param {Promise<unknown>} work
 * @param {number} status
 * @param {string | RegExp} message
 * @param {string} [field]
 */
async function fails(work, status, message, field) {
  const error = await work.then(
    () => null,
    (e) => e,
  );
  assert.ok(error, 'expected a rejection');
  assert.equal(error.name, 'ApiError');
  assert.equal(error.status, status);
  if (typeof message === 'string') assert.equal(error.message, message);
  else assert.match(error.message, message);
  assert.equal(error.field, field);
}

test('projects: list, create, read payload, patch, delete, reorder', async () => {
  const { api, project, item } = setup();
  assert.deepEqual(await api.listProjects(), []);
  await fails(
    api.createProject({ name: 'Kitchen' }),
    400,
    'startDate must be a date like 2026-03-14, got undefined',
    'startDate',
  );
  await fails(
    api.createProject(/** @type {any} */ ([1])),
    400,
    'Body must be a JSON object',
  );

  const p = await api.createProject(
    /** @type {any} */ ({ name: 'Kitchen', startDate: '2026-01-05', extra: 1 }),
  );
  assert.equal(p.budgetCents, 0);
  assert.equal('extra' in p, false);
  const later = await project('Deck');
  const [first, second] = await api.listProjects();
  assert.deepEqual([first.name, second.name], ['Deck', 'Kitchen']);
  assert.equal(later.id, first.id);

  const payload = await api.getProject(p.id);
  assert.deepEqual(Object.keys(payload), [
    'project',
    'schedule',
    'dependencies',
    'variances',
    'notes',
    'materials',
  ]);
  await fails(api.getProject('nope'), 404, 'No project with id nope');

  assert.equal(
    (await api.patchProject(p.id, { budgetCents: 250 })).budgetCents,
    250,
  );
  await fails(
    api.patchProject(p.id, { budgetCents: -1 }),
    400,
    /whole cents/,
    'budgetCents',
  );
  await fails(api.patchProject('nope', {}), 404, /No project/);

  const a = await item(p.id, 'Demo');
  const b = await item(p.id, 'Framing', {
    startDate: '2026-01-01',
    endDate: '2026-01-02',
  });
  assert.deepEqual([a.sortOrder, b.sortOrder], [0, 1]);
  let reordered = await api.reorder(p.id, 'schedule', [b.id, a.id]);
  assert.deepEqual(
    reordered.schedule.map((s) => s.title),
    ['Framing', 'Demo'],
  );
  await fails(
    api.reorder(p.id, 'schedule', [a.id]),
    400,
    /exactly once/,
    'ids',
  );
  await fails(
    api.reorder(p.id, 'schedule', [a.id, a.id]),
    400,
    /exactly once/,
    'ids',
  );
  await fails(
    api.reorder(p.id, /** @type {any} */ ('x'), []),
    400,
    /kind must be/,
    'kind',
  );
  await fails(
    api.reorder(p.id, 'schedule', /** @type {any} */ ([1])),
    400,
    /list of ids/,
    'ids',
  );
  await fails(api.reorder('nope', 'materials', []), 404, /No project/);

  await api.createMaterial(p.id, { name: 'Tile' });
  await api.addDependency(p.id, { predecessorId: a.id, successorId: b.id });
  await api.addNote(a.id, 'Gone with the project');
  await api.patchScheduleItem(a.id, { title: 'Demo day' });
  await api.deleteProject(p.id);
  await fails(api.deleteProject(p.id), 404, /No project/);
  assert.equal((await api.listProjects()).length, 1);
  await fails(api.getProject(p.id), 404, /No project/);
  await fails(api.patchScheduleItem(a.id, {}), 404, /No schedule item/);
});

test('schedule items: create, patch with variances, complete, delete', async () => {
  const { api, project, item } = setup();
  const p = await project();
  await fails(item('nope', 'Demo'), 404, /No project/);
  await fails(
    item(p.id, 'Demo', { endDate: '2026-01-01' }),
    400,
    'endDate 2026-01-01 is before startDate 2026-01-05',
    'endDate',
  );
  await fails(item(p.id, ''), 400, 'title cannot be blank', 'title');

  const a = await item(p.id, 'Demo', { estimatedCents: 500 });
  assert.equal(a.complete, false);
  assert.equal(a.actualCents, null);

  const patched = await api.patchScheduleItem(a.id, {
    title: 'Demolition',
    estimatedCents: 500,
    actualCents: 620,
    reason: 'Dumpster fee',
  });
  assert.equal(patched.title, 'Demolition');
  let payload = await api.getProject(p.id);
  assert.deepEqual(
    payload.variances.map((v) => [
      v.kind,
      v.field,
      v.oldValue,
      v.newValue,
      v.reason,
    ]),
    [
      ['scope', 'title', 'Demo', 'Demolition', 'Dumpster fee'],
      ['cost', 'actualCents', null, '620', 'Dumpster fee'],
    ],
  );
  await fails(
    api.patchScheduleItem(a.id, { startDate: '2026-02-01' }),
    400,
    'endDate 2026-01-09 is before startDate 2026-02-01',
    'endDate',
  );
  await fails(
    api.patchScheduleItem(a.id, { reason: 'x'.repeat(501) }),
    400,
    /over 500/,
    'reason',
  );
  await fails(
    api.patchScheduleItem(a.id, /** @type {any} */ (null)),
    400,
    /JSON object/,
  );
  payload = await api.getProject(p.id);
  assert.equal(
    payload.variances.length,
    2,
    'a rejected patch writes no variance',
  );

  assert.equal((await api.setScheduleComplete(a.id, true)).complete, true);
  await fails(
    api.setScheduleComplete(a.id, /** @type {any} */ ('yes')),
    400,
    /true or false/,
    'complete',
  );
  await fails(api.setScheduleComplete('nope', true), 404, /No schedule item/);

  const b = await item(p.id, 'Framing');
  await api.addDependency(p.id, { predecessorId: b.id, successorId: a.id });
  await api.addNote(a.id, 'Call the hauler');
  const m = await api.createMaterial(p.id, {
    name: 'Tile',
    scheduleItemId: a.id,
  });
  await api.deleteScheduleItem(a.id);
  await fails(api.deleteScheduleItem(a.id), 404, /No schedule item/);
  payload = await api.getProject(p.id);
  assert.deepEqual(
    payload.schedule.map((s) => s.title),
    ['Framing'],
  );
  assert.deepEqual(payload.dependencies, []);
  assert.deepEqual(payload.variances, []);
  assert.deepEqual(payload.notes, []);
  assert.equal(payload.materials[0].id, m.id);
  assert.equal(payload.materials[0].scheduleItemId, null);
});

test('notes: add, edit, delete, and body checks', async () => {
  const { api, project, item } = setup();
  const p = await project();
  const a = await item(p.id, 'Demo');
  await fails(api.addNote(a.id, ''), 400, 'body cannot be blank', 'body');
  await fails(api.addNote('nope', 'x'), 404, /No schedule item/);
  await api.addNote(a.id, 'Earlier');
  const note = await api.addNote(a.id, 'First');
  assert.equal(note.createdAt, note.updatedAt);
  const edited = await api.patchNote(note.id, 'Second');
  assert.equal(edited.body, 'Second');
  assert.ok(edited.updatedAt >= note.updatedAt);
  await fails(api.patchNote('nope', 'x'), 404, /No note/);
  const payload = await api.getProject(p.id);
  assert.deepEqual(
    payload.notes.map((n) => n.body),
    ['Earlier', 'Second'],
  );
  await api.deleteNote(note.id);
  await fails(api.deleteNote(note.id), 404, /No note/);
});

test('dependencies: link, refuse duplicates and loops, unlink', async () => {
  const { api, project, item } = setup();
  const p = await project();
  const other = await project('Deck');
  const a = await item(p.id, 'Demo');
  const b = await item(p.id, 'Framing');
  const c = await item(p.id, 'Drywall');
  const far = await item(other.id, 'Footings');

  await fails(
    api.addDependency(p.id, /** @type {any} */ ({ predecessorId: a.id })),
    400,
    /successorId must be text/,
    'successorId',
  );
  await fails(
    api.addDependency(p.id, { predecessorId: far.id, successorId: b.id }),
    400,
    'predecessorId belongs to another project',
    'predecessorId',
  );
  await fails(
    api.addDependency(p.id, { predecessorId: a.id, successorId: far.id }),
    400,
    'successorId belongs to another project',
    'successorId',
  );
  const ab = await api.addDependency(p.id, {
    predecessorId: a.id,
    successorId: b.id,
  });
  await api.addDependency(p.id, { predecessorId: b.id, successorId: c.id });
  await api.addDependency(p.id, { predecessorId: a.id, successorId: c.id });
  await fails(
    api.addDependency(p.id, { predecessorId: a.id, successorId: b.id }),
    409,
    'Framing already depends on Demo',
    'predecessorId',
  );
  await fails(
    api.addDependency(p.id, { predecessorId: c.id, successorId: a.id }),
    409,
    /^This dependency makes a loop: /,
    'predecessorId',
  );
  const payload = await api.getProject(p.id);
  assert.equal(payload.dependencies.length, 3);
  await api.deleteDependency(ab.id);
  await fails(api.deleteDependency(ab.id), 404, /No dependency/);
});

test('materials: create, link checks, patch, complete, delete, reorder', async () => {
  const { api, project, item } = setup();
  const p = await project();
  const other = await project('Deck');
  const a = await item(p.id, 'Demo');
  const far = await item(other.id, 'Footings');

  await fails(api.createMaterial('nope', { name: 'Tile' }), 404, /No project/);
  await fails(api.createMaterial(p.id, {}), 400, /name must be text/, 'name');
  await fails(
    api.createMaterial(p.id, { name: 'Tile', scheduleItemId: far.id }),
    400,
    'scheduleItemId belongs to another project',
    'scheduleItemId',
  );
  const tile = await api.createMaterial(p.id, {
    name: 'Tile',
    scheduleItemId: a.id,
  });
  const grout = await api.createMaterial(p.id, {
    name: 'Grout',
    allowanceCents: 1000,
  });
  assert.deepEqual([tile.sortOrder, grout.sortOrder], [0, 1]);
  assert.equal(grout.scheduleItemId, null);

  const patched = await api.patchMaterial(tile.id, {
    actualCents: 4200,
    scheduleItemId: null,
  });
  assert.equal(patched.actualCents, 4200);
  assert.equal(patched.scheduleItemId, null);
  await fails(
    api.patchMaterial(tile.id, { actualCents: 1.5 }),
    400,
    /whole cents/,
    'actualCents',
  );
  await fails(api.patchMaterial('nope', {}), 404, /No material item/);

  assert.equal((await api.setMaterialComplete(tile.id, true)).complete, true);
  const reordered = await api.reorder(p.id, 'materials', [grout.id, tile.id]);
  assert.deepEqual(
    reordered.materials.map((m) => m.name),
    ['Grout', 'Tile'],
  );

  await api.deleteMaterial(tile.id);
  await fails(api.deleteMaterial(tile.id), 404, /No material item/);
});

test('export and import round-trip a project with fresh ids', async () => {
  const { api, project, item } = setup();
  const p = await project();
  const a = await item(p.id, 'Demo');
  const b = await item(p.id, 'Framing');
  await api.addDependency(p.id, { predecessorId: a.id, successorId: b.id });
  await api.patchScheduleItem(a.id, { title: 'Demolition' });
  await api.addNote(a.id, 'Hauler booked');
  await api.createMaterial(p.id, { name: 'Tile', scheduleItemId: a.id });

  const file = await api.exportProject(p.id);
  assert.equal(file.format, 'reno-tracker/1');
  await fails(api.exportProject('nope'), 404, /No project/);

  const copy = await api.importProject(file);
  assert.notEqual(copy.project.id, p.id);
  assert.equal(copy.project.name, 'Kitchen');
  assert.equal(copy.project.budgetCents, 100_000);
  assert.deepEqual(
    copy.schedule.map((s) => s.title),
    ['Demolition', 'Framing'],
  );
  assert.equal(copy.dependencies[0].predecessorId, copy.schedule[0].id);
  assert.equal(copy.dependencies[0].successorId, copy.schedule[1].id);
  assert.equal(copy.variances[0].scheduleItemId, copy.schedule[0].id);
  assert.equal(copy.notes[0].scheduleItemId, copy.schedule[0].id);
  assert.equal(copy.materials[0].scheduleItemId, copy.schedule[0].id);
  assert.equal((await api.listProjects()).length, 2);
});

test('import fills defaults and skips rows that point at missing items', async () => {
  const { api } = setup();
  const copy = await api.importProject(
    /** @type {any} */ ({
      format: 'reno-tracker/1',
      exportedAt: 'x',
      project: { name: 'Bare', startDate: '2026-01-01', budgetCents: 'oops' },
      schedule: [
        {
          id: 's1',
          title: 'Demo',
          startDate: '2026-01-01',
          endDate: '2026-01-02',
          complete: 1,
        },
      ],
      dependencies: [{ predecessorId: 's1', successorId: 'gone' }],
      variances: [
        { scheduleItemId: 's1', kind: 'scope', field: 'title', loggedAt: 'x' },
        {
          scheduleItemId: 'gone',
          kind: 'scope',
          field: 'title',
          loggedAt: 'x',
        },
      ],
      notes: [
        { scheduleItemId: 's1', body: 'Kept', createdAt: 'x', updatedAt: 'x' },
        {
          scheduleItemId: 'gone',
          body: 'Dropped',
          createdAt: 'x',
          updatedAt: 'x',
        },
      ],
      materials: [{ name: 'Tile' }, { name: 'Grout', scheduleItemId: 'gone' }],
    }),
  );
  assert.equal(copy.project.budgetCents, 0);
  const [s] = copy.schedule;
  assert.deepEqual(
    [
      s.description,
      s.responsibleParty,
      s.estimatedCents,
      s.actualCents,
      s.complete,
      s.sortOrder,
    ],
    ['', '', 0, null, true, 0],
  );
  assert.deepEqual(copy.dependencies, []);
  assert.equal(copy.variances.length, 1);
  assert.deepEqual(
    [copy.variances[0].oldValue, copy.variances[0].reason],
    [null, ''],
  );
  assert.deepEqual(
    copy.notes.map((n) => n.body),
    ['Kept'],
  );
  assert.deepEqual(
    copy.materials.map((m) => [
      m.name,
      m.scheduleItemId,
      m.sortOrder,
      m.complete,
    ]),
    [
      ['Tile', null, 0, false],
      ['Grout', null, 1, false],
    ],
  );
});

test('import refuses a file from another tool or with a bad structure', async () => {
  const { api } = setup();
  await fails(
    api.importProject(/** @type {any} */ ({ format: 'other' })),
    400,
    'format must be "reno-tracker/1"',
    'format',
  );
  await fails(
    api.importProject(
      /** @type {any} */ ({ format: 'reno-tracker/1', project: { name: 'x' } }),
    ),
    400,
    'project needs a name and a startDate',
    'project',
  );
  await fails(
    api.importProject(
      /** @type {any} */ ({
        format: 'reno-tracker/1',
        project: { name: 'x', startDate: '2026-01-01' },
        schedule: [],
        dependencies: 'no',
      }),
    ),
    400,
    'dependencies must be a list',
    'dependencies',
  );
});

test('every write lands in storage so a second api instance reads it', async () => {
  const { storage, project } = setup();
  const p = await project();
  const again = createLocalApi(storage);
  assert.deepEqual(
    (await again.listProjects()).map((x) => x.id),
    [p.id],
  );
});
