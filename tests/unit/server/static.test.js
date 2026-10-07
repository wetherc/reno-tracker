import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  entityTag,
  isFresh,
  MIME,
  projectRoot,
  realFile,
  resolveFile,
  serveStatic,
} from '../../../src/server/static.js';

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'reno-static-'));
  writeFileSync(join(root, 'index.html'), '<h1>hi</h1>');
  mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'styles', 'base.css'), 'body{}');
  mkdirSync(join(root, 'src', 'server'), { recursive: true });
  writeFileSync(join(root, 'src', 'main.js'), 'export {}');
  writeFileSync(join(root, 'src', 'server', 'index.js'), 'secret');
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data', 'reno.sqlite'), 'db');
  writeFileSync(join(root, '.env'), 'x');
  writeFileSync(join(root, 'README.md'), '# no');
  return root;
}

test('resolveFile maps / to index.html and allows client paths', () => {
  const root = makeRoot();
  try {
    assert.equal(resolveFile(root, '/'), join(root, 'index.html'));
    assert.equal(
      resolveFile(root, '/styles/base.css'),
      join(root, 'styles', 'base.css'),
    );
    assert.equal(
      resolveFile(root, '/src/main.js'),
      join(root, 'src', 'main.js'),
    );
    assert.equal(
      resolveFile(root, '/src/ma%69n.js'),
      join(root, 'src', 'main.js'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveFile refuses traversal, hidden trees, dotfiles, and unknown types', () => {
  const root = makeRoot();
  try {
    for (const path of [
      '/../etc/passwd',
      '/styles/../../etc/passwd',
      '/%2e%2e/etc/passwd',
      '/data/reno.sqlite',
      '/node_modules/x.js',
      '/tests/a.js',
      '/src/server/index.js',
      '/.env',
      '/styles/.hidden.css',
      '/README.md',
      '/index.html%00.png',
      '/%E0%A4%A',
      '/package.json',
      '/pnpm-lock.yaml',
      '/eslint.config.js',
      '/SRC/server/index.js',
      '/src/Server/index.js',
      '/Tests/unit/a.js',
      '/Node_modules/x.js',
      '/Data/reno.sqlite',
      '/lib/a.js',
      '/styles/.Hidden.css',
      '/src/types.ts',
    ]) {
      assert.equal(resolveFile(root, path), null, path);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveFile accepts a client path in another case', () => {
  const root = makeRoot();
  try {
    assert.equal(
      resolveFile(root, '/Styles/base.css'),
      join(root, 'Styles', 'base.css'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('realFile follows links and checks the path on disk again', () => {
  const root = makeRoot();
  const outside = mkdtempSync(join(tmpdir(), 'reno-outside-'));
  try {
    writeFileSync(join(outside, 'secret.js'), 'x');
    symlinkSync(join(outside, 'secret.js'), join(root, 'src', 'out.js'));
    symlinkSync(join(root, 'src', 'server'), join(root, 'src', 'lib'));
    const real = realpathSync(root);
    assert.equal(
      realFile(root, join(root, 'src', 'main.js')),
      join(real, 'src', 'main.js'),
    );
    assert.equal(realFile(root, join(root, 'src', 'out.js')), null);
    assert.equal(realFile(root, join(root, 'src', 'lib', 'index.js')), null);
    assert.equal(realFile(root, join(root, 'src', 'missing.js')), null);
    // APFS folds the long s to s, so this name opens src/server on macOS
    // and names no file on a case-sensitive disk.
    assert.equal(
      realFile(root, join(root, 'src', '\u017Ferver', 'index.js')),
      null,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('MIME covers the types the client ships', () => {
  assert.equal(MIME['.js'], 'text/javascript; charset=utf-8');
  assert.equal(MIME['.svg'], 'image/svg+xml');
  assert.equal('.ts' in MIME, false);
});

test('projectRoot is the directory that holds package.json', () => {
  const manifest = JSON.parse(
    readFileSync(join(projectRoot(), 'package.json'), 'utf8'),
  );
  assert.equal(manifest.name, 'reno-tracker');
});

test('serveStatic streams files with the right headers and 404s the rest', async () => {
  const root = makeRoot();
  const server = createServer(serveStatic(root));
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  /** @param {string} path @param {RequestInit} [init] */
  const call = (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init);
  try {
    let res = await call('/');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.equal(await res.text(), '<h1>hi</h1>');

    res = await call('/styles/base.css?v=2');
    assert.equal(res.headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal(res.headers.get('content-length'), '6');

    res = await call('/styles/base.css', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');

    res = await call('/styles/missing.css');
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not found: /styles/missing.css');

    res = await call('/styles');
    assert.equal(res.status, 404);

    mkdirSync(join(root, 'styles', 'dir.css'));
    res = await call('/styles/dir.css');
    assert.equal(res.status, 404);

    res = await call('/data/reno.sqlite');
    assert.equal(res.status, 404);

    res = await call('/src/server/index.js');
    assert.equal(res.status, 404);

    res = await call('/SRC/Server/index.js');
    assert.equal(res.status, 404);

    chmodSync(join(root, 'src', 'main.js'), 0);
    await assert.rejects(async () => (await call('/src/main.js')).text());
  } finally {
    await new Promise((r) => server.close(() => r(null)));
    rmSync(root, { recursive: true, force: true });
  }
});

test('entityTag and isFresh compare the browser copy with the file', () => {
  const stats = /** @type {any} */ ({ size: 255, mtimeMs: 4096.7 });
  const tag = entityTag(stats);
  assert.equal(tag, 'W/"ff-1000"');
  const modified = new Date('2026-09-24T12:00:00.900Z');
  assert.equal(isFresh({}, tag, modified), false);
  assert.equal(isFresh({ 'if-none-match': tag }, tag, modified), true);
  assert.equal(isFresh({ 'if-none-match': '"ff-1000"' }, tag, modified), true);
  assert.equal(
    isFresh({ 'if-none-match': 'W/"a", W/"ff-1000"' }, tag, modified),
    true,
  );
  assert.equal(isFresh({ 'if-none-match': '*' }, tag, modified), true);
  assert.equal(isFresh({ 'if-none-match': 'W/"a"' }, tag, modified), false);
  const since = 'Thu, 24 Sep 2026 12:00:00 GMT';
  assert.equal(isFresh({ 'if-modified-since': since }, tag, modified), true);
  assert.equal(
    isFresh(
      { 'if-modified-since': 'Thu, 24 Sep 2026 11:59:59 GMT' },
      tag,
      modified,
    ),
    false,
  );
  assert.equal(isFresh({ 'if-modified-since': 'soon' }, tag, modified), false);
  assert.equal(
    isFresh(
      { 'if-none-match': 'W/"a"', 'if-modified-since': since },
      tag,
      modified,
    ),
    false,
  );
});

test('serveStatic answers 304 while the file is unchanged', async () => {
  const root = makeRoot();
  const server = createServer(serveStatic(root));
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  /** @param {Record<string, string>} [headers] */
  const call = (headers) =>
    fetch(`http://127.0.0.1:${port}/styles/base.css`, { headers });
  try {
    let res = await call();
    const tag = String(res.headers.get('etag'));
    const modified = String(res.headers.get('last-modified'));
    assert.match(tag, /^W\/"6-[0-9a-f]+"$/);
    assert.ok(Date.parse(modified) > 0);

    res = await call({ 'if-none-match': tag });
    assert.equal(res.status, 304);
    assert.equal(res.headers.get('etag'), tag);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.equal(await res.text(), '');

    res = await call({ 'if-modified-since': modified });
    assert.equal(res.status, 304);

    writeFileSync(join(root, 'styles', 'base.css'), 'body{color:red}');
    res = await call({ 'if-none-match': tag });
    assert.equal(res.status, 200);
    assert.notEqual(res.headers.get('etag'), tag);
    assert.equal(await res.text(), 'body{color:red}');
  } finally {
    await new Promise((r) => server.close(() => r(null)));
    rmSync(root, { recursive: true, force: true });
  }
});
