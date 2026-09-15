import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './harness.js';

test('schedule routes: create, patch with variances, complete, delete', async () => {
  const app = await startApp();
  try {
    const project = await app.project();
    let res = await app.api('POST', `/api/projects/${project.id}/schedule`, {
      title: 'Demo',
      startDate: '2026-01-05',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'endDate');

    res = await app.api('POST', `/api/projects/${project.id}/schedule`, {
      title: 'Demo',
      startDate: '2026-01-05',
      endDate: '2026-01-04',
    });
    assert.equal(res.status, 400);
    assert.equal(
      res.body.error,
      'endDate 2026-01-04 is before startDate 2026-01-05',
    );

    res = await app.api('POST', `/api/projects/nope/schedule`, {
      title: 'Demo',
      startDate: '2026-01-05',
      endDate: '2026-01-05',
    });
    assert.equal(res.status, 404);

    const item = await app.item(project.id, 'Demo', {
      estimatedCents: 1000,
      complete: true,
      sortOrder: 9,
    });
    assert.equal(item.complete, false);
    assert.equal(item.sortOrder, 0);

    res = await app.api('PATCH', `/api/schedule/${item.id}`, {
      startDate: '2026-01-10',
    });
    assert.equal(res.status, 400);
    assert.equal(
      res.body.error,
      'endDate 2026-01-09 is before startDate 2026-01-10',
    );

    res = await app.api('PATCH', `/api/schedule/${item.id}`, {
      title: 'Demo day',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Demo day');

    res = await app.api('PATCH', `/api/schedule/${item.id}`, {
      estimatedCents: 1500,
      reason: 'quote',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.estimatedCents, 1500);
    assert.equal('reason' in res.body, false);

    res = await app.api('PATCH', `/api/schedule/${item.id}`, {
      title: 'x',
      reason: 5,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'reason');

    res = await app.api('PATCH', `/api/schedule/nope`, { title: 'x' });
    assert.equal(res.status, 404);

    res = await app.api('POST', `/api/schedule/${item.id}/complete`, {
      complete: true,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.complete, true);
    res = await app.api('POST', `/api/schedule/${item.id}/complete`, {
      complete: 'yes',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'complete must be true or false, got "yes"',
      field: 'complete',
    });

    res = await app.api('GET', `/api/projects/${project.id}`);
    assert.deepEqual(
      res.body.variances.map((/** @type {any} */ v) => [v.field, v.reason]),
      [
        ['title', ''],
        ['estimatedCents', 'quote'],
      ],
    );

    res = await app.api('DELETE', `/api/schedule/${item.id}`);
    assert.equal(res.status, 204);
    res = await app.api('DELETE', `/api/schedule/${item.id}`);
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});

test('note routes', async () => {
  const app = await startApp();
  try {
    const project = await app.project();
    const item = await app.item(project.id, 'Demo');
    let res = await app.api('POST', `/api/schedule/${item.id}/notes`, {
      body: '',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'body cannot be blank',
      field: 'body',
    });
    res = await app.api('POST', `/api/schedule/${item.id}/notes`, {
      body: 'Call plumber',
    });
    assert.equal(res.status, 201);
    const note = res.body;
    res = await app.api('PATCH', `/api/notes/${note.id}`, { body: 'Called' });
    assert.equal(res.status, 200);
    assert.equal(res.body.body, 'Called');
    res = await app.api('DELETE', `/api/notes/${note.id}`);
    assert.equal(res.status, 204);
    res = await app.api('PATCH', `/api/notes/${note.id}`, { body: 'x' });
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});

test('dependency routes reject loops with 409', async () => {
  const app = await startApp();
  try {
    const project = await app.project();
    const a = await app.item(project.id, 'Demo');
    const b = await app.item(project.id, 'Framing');
    let res = await app.api(
      'POST',
      `/api/projects/${project.id}/dependencies`,
      { predecessorId: a.id },
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'successorId');
    res = await app.api('POST', `/api/projects/${project.id}/dependencies`, {
      predecessorId: a.id,
      successorId: b.id,
    });
    assert.equal(res.status, 201);
    const dep = res.body;
    res = await app.api('POST', `/api/projects/${project.id}/dependencies`, {
      predecessorId: b.id,
      successorId: a.id,
    });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, {
      error: 'This dependency makes a loop: Demo -> Framing -> Demo',
      field: 'predecessorId',
    });
    res = await app.api('DELETE', `/api/dependencies/${dep.id}`);
    assert.equal(res.status, 204);
    res = await app.api('DELETE', `/api/dependencies/${dep.id}`);
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});

test('material routes', async () => {
  const app = await startApp();
  try {
    const project = await app.project();
    const item = await app.item(project.id, 'Demo');
    let res = await app.api('POST', `/api/projects/${project.id}/materials`, {
      allowanceCents: 5,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'name');
    res = await app.api('POST', `/api/projects/${project.id}/materials`, {
      name: 'Tile',
      scheduleItemId: item.id,
      expectedDate: '2026-02-01',
    });
    assert.equal(res.status, 201);
    const tile = res.body;
    assert.equal(tile.scheduleItemId, item.id);
    res = await app.api('PATCH', `/api/materials/${tile.id}`, {
      actualCents: 4200,
      expectedDate: null,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.actualCents, 4200);
    assert.equal(res.body.expectedDate, null);
    res = await app.api('PATCH', `/api/materials/${tile.id}`, {
      expectedDate: 'later',
    });
    assert.equal(res.status, 400);
    res = await app.api('POST', `/api/materials/${tile.id}/complete`, {
      complete: true,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.complete, true);
    res = await app.api('DELETE', `/api/materials/${tile.id}`);
    assert.equal(res.status, 204);
    res = await app.api('DELETE', `/api/materials/${tile.id}`);
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});
