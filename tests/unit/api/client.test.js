import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../../../src/api/client.js';
import { ApiError, describeFailure } from '../../../src/api/errors.js';

/**
 * @param {{ status: number, body?: unknown, text?: string }} reply
 */
function fakeFetch(reply) {
  /** @type {{ url: string, init: RequestInit }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const text =
      reply.text ??
      (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return /** @type {Response} */ ({
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      text: async () => text,
    });
  };
  return { fetchFn, calls };
}

test('request sends JSON and parses the reply', async () => {
  const { fetchFn, calls } = fakeFetch({ status: 201, body: { id: 'p1' } });
  const api = createApi({ fetch: fetchFn, base: 'http://x' });
  const project = await api.createProject({ name: 'Kitchen' });
  assert.deepEqual(project, { id: 'p1' });
  assert.equal(calls[0].url, 'http://x/api/projects');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"name":"Kitchen"}');
  assert.deepEqual(calls[0].init.headers, {
    'content-type': 'application/json',
  });
});

test('GET and DELETE send no body or content type', async () => {
  const { fetchFn, calls } = fakeFetch({ status: 204 });
  const api = createApi({ fetch: fetchFn });
  assert.equal(await api.deleteProject('p1'), undefined);
  assert.equal(calls[0].init.body, undefined);
  assert.deepEqual(calls[0].init.headers, {});
});

test('a server error becomes an ApiError with the message and field', async () => {
  const { fetchFn } = fakeFetch({
    status: 400,
    body: { error: 'title cannot be blank', field: 'title' },
  });
  const api = createApi({ fetch: fetchFn });
  await assert.rejects(api.createScheduleItem('p1', { title: '' }), (e) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 400);
    assert.equal(e.message, 'title cannot be blank');
    assert.equal(e.field, 'title');
    return true;
  });
});

test('a non-JSON error reply gets a status message', async () => {
  const { fetchFn } = fakeFetch({ status: 502, text: '<html>bad gateway' });
  const api = createApi({ fetch: fetchFn });
  await assert.rejects(api.listProjects(), {
    message: 'The server answered 502',
  });
});

test('an empty 200 body resolves to null', async () => {
  const { fetchFn } = fakeFetch({ status: 200 });
  assert.equal(await createApi({ fetch: fetchFn }).listProjects(), null);
});

test('every route builds the path from the plan', async () => {
  const { fetchFn, calls } = fakeFetch({ status: 200, body: {} });
  const api = createApi({ fetch: fetchFn });
  await api.getProject('p');
  await api.patchProject('p', { name: 'N' });
  await api.patchScheduleItem('s', { title: 'T', reason: 'why' });
  await api.deleteScheduleItem('s');
  await api.setScheduleComplete('s', true);
  await api.addNote('s', 'hi');
  await api.patchNote('n', 'ho');
  await api.deleteNote('n');
  await api.addDependency('p', { predecessorId: 'a', successorId: 'b' });
  await api.deleteDependency('d');
  await api.createMaterial('p', { name: 'Tile' });
  await api.patchMaterial('m', { name: 'Grout' });
  await api.deleteMaterial('m');
  await api.setMaterialComplete('m', false);
  await api.reorder('p', 'schedule', ['a', 'b']);
  await api.importProject(/** @type {any} */ ({ format: 'reno-tracker/1' }));
  await api.exportProject('p');
  assert.deepEqual(
    calls.map((c) => `${c.init.method} ${c.url}`),
    [
      'GET /api/projects/p',
      'PATCH /api/projects/p',
      'PATCH /api/schedule/s',
      'DELETE /api/schedule/s',
      'POST /api/schedule/s/complete',
      'POST /api/schedule/s/notes',
      'PATCH /api/notes/n',
      'DELETE /api/notes/n',
      'POST /api/projects/p/dependencies',
      'DELETE /api/dependencies/d',
      'POST /api/projects/p/materials',
      'PATCH /api/materials/m',
      'DELETE /api/materials/m',
      'POST /api/materials/m/complete',
      'POST /api/projects/p/reorder',
      'POST /api/projects/import',
      'GET /api/projects/p/export',
    ],
  );
  assert.equal(calls[4].init.body, '{"complete":true}');
  assert.equal(calls[14].init.body, '{"kind":"schedule","ids":["a","b"]}');
});

test('describeFailure picks the text a person reads', () => {
  assert.equal(
    describeFailure(new ApiError(409, { error: 'Loop: A -> B -> A' })),
    'Loop: A -> B -> A',
  );
  assert.match(describeFailure(new TypeError('fetch failed')), /reach/);
  assert.equal(describeFailure(new Error('odd')), 'odd');
  assert.equal(describeFailure(new Error('')), 'Something went wrong.');
  assert.equal(describeFailure('nope'), 'Something went wrong.');
});
