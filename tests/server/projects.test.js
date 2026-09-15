import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './harness.js';

test('project routes: list, create, read payload, patch, delete, reorder', async () => {
  const app = await startApp();
  try {
    let res = await app.api('GET', '/api/projects');
    assert.deepEqual(res, { ...res, status: 200, body: [] });

    res = await app.api('POST', '/api/projects', { name: 'Kitchen' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'startDate must be a date like 2026-03-14, got undefined',
      field: 'startDate',
    });

    res = await app.api('POST', '/api/projects', {
      name: 'Kitchen',
      startDate: '2026-01-05',
      extra: 1,
    });
    assert.equal(res.status, 201);
    const project = res.body;
    assert.equal(project.budgetCents, 0);
    assert.equal('extra' in project, false);

    res = await app.api('GET', `/api/projects/${project.id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), [
      'project',
      'schedule',
      'dependencies',
      'variances',
      'notes',
      'materials',
    ]);

    res = await app.api('PATCH', `/api/projects/${project.id}`, {
      budgetCents: 250,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.budgetCents, 250);

    res = await app.api('PATCH', `/api/projects/${project.id}`, {
      budgetCents: -1,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'budgetCents');

    res = await app.api('PATCH', `/api/projects/${project.id}`, [1]);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Body must be a JSON object');

    const a = await app.item(project.id, 'Demo');
    const b = await app.item(project.id, 'Framing');
    res = await app.api('POST', `/api/projects/${project.id}/reorder`, {
      kind: 'schedule',
      ids: [b.id, a.id],
    });
    assert.equal(res.status, 201);
    assert.deepEqual(
      res.body.schedule.map((/** @type {any} */ s) => s.title),
      ['Framing', 'Demo'],
    );
    res = await app.api('POST', `/api/projects/${project.id}/reorder`, {
      kind: 'materials',
      ids: [],
    });
    assert.equal(res.status, 201);
    res = await app.api('POST', `/api/projects/${project.id}/reorder`, {
      kind: 'x',
      ids: [],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'kind');
    res = await app.api('POST', `/api/projects/${project.id}/reorder`, {
      kind: 'schedule',
      ids: 'a',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'ids');

    res = await app.api('DELETE', `/api/projects/${project.id}`);
    assert.equal(res.status, 204);
    res = await app.api('GET', `/api/projects/${project.id}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, `No project with id ${project.id}`);
    res = await app.api('DELETE', `/api/projects/${project.id}`);
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});

test('unknown api paths answer 404 JSON and static paths fall through', async () => {
  const app = await startApp();
  try {
    let res = await app.api('GET', '/api/nothing');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'No route for GET /api/nothing' });
    res = await app.api('GET', '/api');
    assert.equal(res.status, 404);
    const page = await fetch(`http://127.0.0.1:${app.port}/package.json`);
    assert.equal(page.status, 404);
    assert.equal(page.headers.get('content-type'), 'text/plain; charset=utf-8');
  } finally {
    await app.close();
  }
});
