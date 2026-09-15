import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  Router,
  compilePattern,
  requestTarget,
} from '../../../src/server/router.js';
import { badRequest } from '../../../src/server/errors.js';

/**
 * Starts a server for the router on port 0 and returns a fetch helper.
 * @param {Router} router
 */
async function serve(router) {
  const server = createServer((req, res) => router.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    /** @param {string} path @param {RequestInit} [init] */
    call: (path, init) => fetch(`http://127.0.0.1:${addr.port}${path}`, init),
    close: () => new Promise((r) => server.close(() => r(null))),
  };
}

test('compilePattern binds named segments and tolerates a trailing slash', () => {
  const { keys, regex } = compilePattern('/api/projects/:id/notes');
  assert.deepEqual(keys, ['id']);
  assert.ok(regex.test('/api/projects/abc/notes'));
  assert.ok(regex.test('/api/projects/abc/notes/'));
  assert.equal(regex.test('/api/projects/abc'), false);
  assert.equal(regex.test('/api/projects/a/b/notes'), false);
});

test('match returns params, a method list, or null', () => {
  const router = new Router().get('/a/:id', () => 1).post('/a/:id', () => 2);
  const hit = router.match('GET', '/a/x%20y');
  assert.deepEqual(hit && 'params' in hit ? hit.params : null, { id: 'x y' });
  assert.deepEqual(router.match('DELETE', '/a/1'), { allow: ['GET', 'POST'] });
  assert.equal(router.match('GET', '/b'), null);
});

test('handle writes JSON with 200, 201, and 204 by method and result', async () => {
  const router = new Router()
    .get('/things/:id', ({ params }) => ({ id: params.id }))
    .post('/things', ({ body }) => ({ got: body }))
    .patch('/things/:id', ({ body }) => body)
    .delete('/things/:id', () => undefined);
  const { call, close } = await serve(router);
  try {
    let res = await call('/things/7?x=1');
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get('content-type'),
      'application/json; charset=utf-8',
    );
    assert.deepEqual(await res.json(), { id: '7' });

    res = await call('/things', { method: 'POST', body: '{"a":1}' });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { got: { a: 1 } });

    res = await call('/things/1', { method: 'PATCH' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {});

    res = await call('/things/1', { method: 'DELETE' });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), '');
  } finally {
    await close();
  }
});

test('handle maps errors to 400, 404, 405, 413, and 500', async () => {
  /** @type {unknown[]} */
  const logged = [];
  const router = new Router()
    .post('/ok', () => 1)
    .get('/bad', () => {
      throw badRequest('name cannot be blank', 'name');
    })
    .get('/boom', () => {
      throw new Error('secret detail');
    });
  router.onError = (e) => logged.push(e);
  const { call, close } = await serve(router);
  try {
    let res = await call('/ok', { method: 'POST', body: '{not json' });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Body is not valid JSON' });

    res = await call('/bad');
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: 'name cannot be blank',
      field: 'name',
    });

    res = await call('/missing');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'No route for GET /missing' });

    res = await call('/ok');
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
    assert.deepEqual(await res.json(), { error: '/ok does not accept GET' });

    res = await call('/ok', { method: 'POST', body: 'x'.repeat(1_000_001) });
    assert.equal(res.status, 413);

    res = await call('/boom');
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), {
      error: 'Something went wrong on the server',
    });
    assert.equal(logged.length, 1);
    assert.match(String(logged[0]), /secret detail/);
  } finally {
    await close();
  }
});

test('requestTarget reads the method and path and fills a bare request', () => {
  assert.deepEqual(requestTarget({ method: 'POST', url: '/api/x?y=1' }), {
    method: 'POST',
    path: '/api/x',
  });
  assert.deepEqual(requestTarget({}), { method: 'GET', path: '/' });
});
