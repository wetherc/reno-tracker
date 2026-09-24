// Raw requests that fetch cannot make, such as a foreign Host header and
// a request target that is not a URL, and the headers on every answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect } from 'node:net';
import { SECURITY_HEADERS } from '../../src/server/guard.js';
import { startApp } from './harness.js';

/**
 * @param {number} port
 * @param {{ method?: string, path?: string, headers?: Record<string, string>, body?: string }} options
 * @returns {Promise<{ status: number, body: any, headers: import('node:http').IncomingHttpHeaders }>}
 */
function raw(port, { method = 'GET', path = '/api/projects', headers, body }) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method, path, headers },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(text),
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('a foreign Host gets 421 on the API and on static files', async () => {
  const app = await startApp();
  try {
    for (const path of ['/api/projects', '/index.html']) {
      const res = await raw(app.port, {
        path,
        headers: { host: `evil.example:${app.port}` },
      });
      assert.equal(res.status, 421);
      assert.deepEqual(res.body, {
        error: 'This server answers only to 127.0.0.1 and localhost',
      });
    }
    const ok = await raw(app.port, {
      headers: { host: `localhost:${app.port}` },
    });
    assert.equal(ok.status, 200);
  } finally {
    await app.close();
  }
});

test('a cross-site text/plain POST creates nothing', async () => {
  const app = await startApp();
  try {
    const body = JSON.stringify({ name: 'X', startDate: '2026-01-05' });
    let res = await raw(app.port, {
      method: 'POST',
      headers: { origin: 'http://evil.example', 'content-type': 'text/plain' },
      body,
    });
    assert.equal(res.status, 403);
    res = await raw(app.port, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
    });
    assert.equal(res.status, 415);
    assert.deepEqual((await app.api('GET', '/api/projects')).body, []);
  } finally {
    await app.close();
  }
});

test('a request target that is not a URL gets 400 and the server lives', async () => {
  const app = await startApp();
  try {
    const reply = await new Promise((resolve, reject) => {
      const socket = connect(app.port, '127.0.0.1', () =>
        socket.end(
          `GET http://[/ HTTP/1.1\r\nHost: 127.0.0.1:${app.port}\r\n\r\n`,
        ),
      );
      let text = '';
      socket.on('data', (chunk) => (text += chunk));
      socket.on('end', () => resolve(text));
      socket.on('error', reject);
    });
    assert.match(String(reply), /^HTTP\/1\.1 400 /);
    assert.equal((await app.api('GET', '/api/projects')).status, 200);
  } finally {
    await app.close();
  }
});

test('every answer sends the security headers', async () => {
  const app = await startApp();
  const names = Object.keys(SECURITY_HEADERS);
  /** @param {Record<string, unknown>} headers lower-case names */
  const pick = (headers) =>
    Object.fromEntries(
      names.map((name) => [name, headers[name.toLowerCase()]]),
    );
  try {
    for (const path of ['/api/projects', '/index.html', '/package.json']) {
      const res = await fetch(`http://127.0.0.1:${app.port}${path}`);
      assert.deepEqual(
        pick(Object.fromEntries(res.headers)),
        SECURITY_HEADERS,
        path,
      );
    }
    const foreign = await raw(app.port, {
      headers: { host: `evil.example:${app.port}` },
    });
    assert.equal(foreign.status, 421);
    assert.deepEqual(pick(foreign.headers), SECURITY_HEADERS);
  } finally {
    await app.close();
  }
});
