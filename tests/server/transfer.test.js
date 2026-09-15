import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './harness.js';

test('export then import creates a matching project with new ids', async () => {
  const app = await startApp();
  try {
    const project = await app.project();
    const a = await app.item(project.id, 'Demo', { estimatedCents: 100 });
    const b = await app.item(project.id, 'Framing');
    await app.api('POST', `/api/projects/${project.id}/dependencies`, {
      predecessorId: a.id,
      successorId: b.id,
    });
    await app.api('PATCH', `/api/schedule/${a.id}`, {
      estimatedCents: 150,
      reason: 'quote',
    });
    await app.api('POST', `/api/schedule/${a.id}/notes`, { body: 'note' });
    await app.api('POST', `/api/schedule/${b.id}/complete`, { complete: true });
    await app.api('POST', `/api/projects/${project.id}/materials`, {
      name: 'Tile',
      scheduleItemId: a.id,
    });
    await app.api('POST', `/api/projects/${project.id}/materials`, {
      name: 'Loose',
    });

    let res = await app.api('GET', `/api/projects/${project.id}/export`);
    assert.equal(res.status, 200);
    const file = res.body;
    assert.equal(file.format, 'reno-tracker/1');
    assert.match(file.exportedAt, /^\d{4}-/);

    res = await app.api('POST', '/api/projects/import', file);
    assert.equal(res.status, 201);
    const copy = res.body;
    assert.notEqual(copy.project.id, project.id);
    assert.equal(copy.project.name, 'Kitchen');
    assert.equal(copy.schedule.length, 2);
    const demo = copy.schedule.find(
      (/** @type {any} */ s) => s.title === 'Demo',
    );
    const framing = copy.schedule.find(
      (/** @type {any} */ s) => s.title === 'Framing',
    );
    assert.notEqual(demo.id, a.id);
    assert.equal(framing.complete, true);
    assert.deepEqual(
      [copy.dependencies[0].predecessorId, copy.dependencies[0].successorId],
      [demo.id, framing.id],
    );
    assert.equal(copy.variances[0].scheduleItemId, demo.id);
    assert.equal(copy.variances[0].reason, 'quote');
    assert.equal(copy.notes[0].scheduleItemId, demo.id);
    assert.deepEqual(
      copy.materials.map((/** @type {any} */ m) => [m.name, m.scheduleItemId]),
      [
        ['Tile', demo.id],
        ['Loose', null],
      ],
    );

    res = await app.api('GET', '/api/projects');
    assert.equal(res.body.length, 2);
  } finally {
    await app.close();
  }
});

test('import rejects files from other tools or with missing parts', async () => {
  const app = await startApp();
  try {
    let res = await app.api('POST', '/api/projects/import', {
      format: 'other',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'format must be "reno-tracker/1"',
      field: 'format',
    });
    res = await app.api('POST', '/api/projects/import', {
      format: 'reno-tracker/1',
      project: {},
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'project');
    res = await app.api('POST', '/api/projects/import', {
      format: 'reno-tracker/1',
      project: { name: 'x', startDate: '2026-01-01' },
      schedule: [],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'dependencies');
    res = await app.api('GET', '/api/projects/nope/export');
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});
