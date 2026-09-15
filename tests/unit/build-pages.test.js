import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildPages,
  includeFile,
  localizeIndex,
  repoRoot,
} from '../../scripts/build-pages.js';

test('localizeIndex switches the backend meta tag and refuses a page without one', () => {
  const html = '<head><meta name="reno-backend" content="server" /></head>';
  assert.equal(
    localizeIndex(html),
    '<head><meta name="reno-backend" content="local" /></head>',
  );
  assert.throws(() => localizeIndex('<head></head>'), /no .* tag to switch/);
});

test('includeFile drops only src/server', () => {
  const root = '/repo';
  assert.equal(includeFile(root, '/repo/src/main.js'), true);
  assert.equal(includeFile(root, '/repo/src/local/api.js'), true);
  assert.equal(includeFile(root, '/repo/styles/base.css'), true);
  assert.equal(includeFile(root, '/repo/src/server'), false);
  assert.equal(includeFile(root, '/repo/src/server/app.js'), false);
});

test('buildPages writes the site from the real repository', () => {
  const out = mkdtempSync(join(tmpdir(), 'reno-pages-'));
  try {
    writeFileSync(join(out, 'stale.txt'), 'old build');
    buildPages(repoRoot(), out);
    assert.equal(existsSync(join(out, 'stale.txt')), false);
    const index = readFileSync(join(out, 'index.html'), 'utf8');
    assert.ok(index.includes('content="local"'));
    assert.ok(!index.includes('content="server"'));
    assert.ok(!index.includes('href="/'), 'no root-absolute links');
    assert.ok(!index.includes('src="/'), 'no root-absolute scripts');
    for (const file of [
      'style.css',
      'favicon.svg',
      '.nojekyll',
      'styles/base.css',
      'src/main.js',
      'src/boot.js',
      'src/local/api.js',
    ]) {
      assert.ok(existsSync(join(out, file)), `${file} is in the build`);
    }
    assert.equal(existsSync(join(out, 'src/server')), false);
    assert.equal(existsSync(join(out, 'package.json')), false);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
