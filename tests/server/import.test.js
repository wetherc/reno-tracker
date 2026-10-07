// Runs each import case against the server and the browser store, and
// expects the same answer from both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './harness.js';
import { createLocalApi } from '../../src/local/api.js';
import { memoryStorage } from '../../src/storage/prefs.js';
import { AT, file, REFUSED } from './importCases.js';

/** @typedef {{ status: number, body: any }} Answer */

/**
 * Swaps every fresh id for a stable label, so two imports compare equal.
 * @param {any} payload an export of the imported project
 */
function normalize(payload) {
  /** @type {Map<string, string>} */
  const names = new Map(
    payload.schedule.map((/** @type {any} */ s) => [s.id, `item:${s.title}`]),
  );
  /** @type {Map<string, string>} */
  const materials = new Map(
    payload.materials.map((/** @type {any} */ m) => [
      m.id,
      `material:${m.name}`,
    ]),
  );
  /** @param {string | null} id */
  const name = (id) => (id === null ? null : names.get(id));
  /** @param {any} row */
  const strip = ({ id: _id, projectId: _p, ...rest }) => rest;
  return {
    project: {
      name: payload.project.name,
      budgetCents: payload.project.budgetCents,
      startDate: payload.project.startDate,
    },
    schedule: payload.schedule.map(strip),
    dependencies: payload.dependencies.map((/** @type {any} */ d) => [
      name(d.predecessorId),
      name(d.successorId),
    ]),
    variances: payload.variances.map((/** @type {any} */ v) => ({
      ...strip(v),
      scheduleItemId: name(v.scheduleItemId),
    })),
    notes: payload.notes.map((/** @type {any} */ n) => ({
      ...strip(n),
      scheduleItemId: name(n.scheduleItemId),
    })),
    materials: payload.materials.map((/** @type {any} */ m) => ({
      ...strip(m),
      scheduleItemId: name(m.scheduleItemId),
    })),
    invoices: payload.invoices.map((/** @type {any} */ i) => ({
      ...strip(i),
      lines: i.lines.map((/** @type {any} */ l) => ({
        ...strip(l),
        scheduleItemId: name(l.scheduleItemId),
        materialItemId: materials.get(l.materialItemId) ?? null,
      })),
    })),
  };
}

/**
 * @param {Awaited<ReturnType<typeof startApp>>} app
 * @param {unknown} body
 * @returns {Promise<[Answer, Answer]>}
 */
async function importBoth(app, body) {
  const res = await app.api('POST', '/api/projects/import', body);
  const server = {
    status: res.status,
    body:
      res.status === 201
        ? normalize(
            (
              await app.api(
                'GET',
                `/api/projects/${res.body.project.id}/export`,
              )
            ).body,
          )
        : res.body,
  };
  const api = createLocalApi(memoryStorage());
  /** @type {Answer} */
  let local;
  try {
    const copy = await api.importProject(/** @type {any} */ (body));
    local = {
      status: 201,
      body: normalize(await api.exportProject(copy.project.id)),
    };
  } catch (/** @type {any} */ error) {
    local = {
      status: error.status,
      body: error.field
        ? { error: error.message, field: error.field }
        : { error: error.message },
    };
  }
  return [server, local];
}

test('both backends refuse the same bad files with the same 400', async () => {
  const app = await startApp();
  try {
    for (const [name, body, error, field] of REFUSED) {
      const [server, local] = await importBoth(app, body);
      const expected = {
        status: 400,
        body: field ? { error, field } : { error },
      };
      assert.deepEqual(server, expected, `server: ${name}`);
      assert.deepEqual(local, expected, `browser store: ${name}`);
    }
    const projects = await app.api('GET', '/api/projects');
    assert.deepEqual(projects.body, []);
  } finally {
    await app.close();
  }
});

test('both backends fill defaults, drop dangling rows and repeated edges, and unlink unknown items', async () => {
  const app = await startApp();
  try {
    const [server, local] = await importBoth(
      app,
      file({
        schedule: [
          {
            id: 'a',
            title: 'Demo',
            startDate: '2026-01-05',
            endDate: '2026-01-06',
          },
          {
            id: 'b',
            title: 'Tile',
            startDate: '2026-01-07',
            endDate: '2026-01-09',
            complete: true,
            sortOrder: 7,
            actualCents: 900,
            markupBasisPoints: 2500,
          },
        ],
        dependencies: [
          { predecessorId: 'a', successorId: 'b' },
          { predecessorId: 'a', successorId: 'b' },
          { predecessorId: 'a', successorId: 'gone' },
          { predecessorId: 5, successorId: 'b' },
        ],
        variances: [
          { scheduleItemId: 'a', kind: 'scope', field: 'title', loggedAt: AT },
          { scheduleItemId: 'gone', kind: 'mood', field: 'x' },
        ],
        notes: [
          { scheduleItemId: 'a', body: 'Kept', createdAt: AT },
          { scheduleItemId: 'gone', body: '' },
        ],
        materials: [
          {
            id: 'g',
            name: 'Grout',
            scheduleItemId: 'a',
            expectedDate: '2026-01-08',
          },
          {
            name: 'Loose',
            scheduleItemId: 'gone',
            complete: true,
            markupBasisPoints: 0,
          },
        ],
        invoices: [
          {
            id: 'x',
            party: 'Pinch',
            issuedDate: '2026-01-10',
            lines: [
              { scheduleItemId: 'b', amountCents: 900, extra: 1 },
              {
                materialItemId: 'g',
                amountCents: 50,
                description: 'Bag',
                markupBasisPoints: 1200,
              },
            ],
          },
        ],
      }),
    );
    assert.equal(server.status, 201);
    assert.deepEqual(local, server);
    const imported = server.body;
    assert.deepEqual(imported.project, {
      name: 'Bath',
      budgetCents: 500,
      startDate: '2026-01-05',
    });
    assert.deepEqual(imported.schedule, [
      {
        title: 'Demo',
        description: '',
        startDate: '2026-01-05',
        endDate: '2026-01-06',
        responsibleParty: '',
        estimatedCents: 0,
        actualCents: null,
        markupBasisPoints: null,
        complete: false,
        sortOrder: 0,
      },
      {
        title: 'Tile',
        description: '',
        startDate: '2026-01-07',
        endDate: '2026-01-09',
        responsibleParty: '',
        estimatedCents: 0,
        actualCents: 900,
        markupBasisPoints: 2500,
        complete: true,
        sortOrder: 7,
      },
    ]);
    assert.deepEqual(imported.dependencies, [['item:Demo', 'item:Tile']]);
    assert.deepEqual(imported.variances, [
      {
        scheduleItemId: 'item:Demo',
        kind: 'scope',
        field: 'title',
        oldValue: null,
        newValue: null,
        reason: '',
        loggedAt: AT,
      },
    ]);
    assert.deepEqual(imported.notes, [
      {
        scheduleItemId: 'item:Demo',
        body: 'Kept',
        createdAt: AT,
        updatedAt: AT,
      },
    ]);
    assert.deepEqual(
      imported.materials.map((/** @type {any} */ m) => [
        m.name,
        m.scheduleItemId,
        m.allowanceCents,
        m.estimatedCents,
        m.actualCents,
        m.markupBasisPoints,
        m.complete,
        m.expectedDate,
        m.sortOrder,
      ]),
      [
        ['Grout', 'item:Demo', 0, 0, null, null, false, '2026-01-08', 0],
        ['Loose', null, 0, 0, null, 0, true, null, 1],
      ],
    );
    assert.deepEqual(imported.invoices, [
      {
        number: '',
        party: 'Pinch',
        issuedDate: '2026-01-10',
        dueDate: null,
        markupBasisPoints: 0,
        lines: [
          {
            scheduleItemId: 'item:Tile',
            materialItemId: null,
            description: '',
            amountCents: 900,
            markupBasisPoints: null,
          },
          {
            scheduleItemId: null,
            materialItemId: 'material:Grout',
            description: 'Bag',
            amountCents: 50,
            markupBasisPoints: 1200,
          },
        ],
        retainageCents: 0,
        payments: [],
      },
    ]);
  } finally {
    await app.close();
  }
});

test('a note or change row with no time gets the import time', async () => {
  const app = await startApp();
  try {
    const before = new Date().toISOString();
    const [server, local] = await importBoth(
      app,
      file({
        variances: [{ scheduleItemId: 'a', kind: 'scope', field: 'title' }],
        notes: [{ scheduleItemId: 'a', body: 'Hi' }],
      }),
    );
    for (const answer of [server, local]) {
      const [variance] = answer.body.variances;
      const [note] = answer.body.notes;
      assert.ok(variance.loggedAt >= before);
      assert.ok(note.createdAt >= before);
      assert.equal(note.updatedAt, note.createdAt);
    }
  } finally {
    await app.close();
  }
});

test('both backends store a time with an offset as UTC', async () => {
  const app = await startApp();
  try {
    const answers = await importBoth(
      app,
      file({
        variances: [
          {
            scheduleItemId: 'a',
            kind: 'scope',
            field: 'title',
            loggedAt: '2026-01-05T09:00-05:00',
          },
        ],
        notes: [
          {
            scheduleItemId: 'a',
            body: 'Hi',
            createdAt: '2026-01-05T09:00+01:00',
          },
        ],
      }),
    );
    for (const answer of answers) {
      assert.equal(
        answer.body.variances[0].loggedAt,
        '2026-01-05T14:00:00.000Z',
      );
      assert.equal(answer.body.notes[0].createdAt, '2026-01-05T08:00:00.000Z');
      assert.equal(answer.body.notes[0].updatedAt, '2026-01-05T08:00:00.000Z');
    }
  } finally {
    await app.close();
  }
});

test('both backends take a long chain of dependencies', async () => {
  const app = await startApp();
  try {
    const count = 12000;
    const schedule = Array.from({ length: count }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      startDate: '2026-01-05',
      endDate: '2026-01-05',
    }));
    const dependencies = schedule.slice(1).map((s, i) => ({
      predecessorId: `s${i}`,
      successorId: s.id,
    }));
    const answers = await importBoth(app, file({ schedule, dependencies }));
    for (const answer of answers) {
      assert.equal(answer.status, 201);
      assert.equal(answer.body.dependencies.length, count - 1);
    }
  } finally {
    await app.close();
  }
});

test('export of an unknown project answers 404', async () => {
  const app = await startApp();
  try {
    const res = await app.api('GET', '/api/projects/nope/export');
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});
