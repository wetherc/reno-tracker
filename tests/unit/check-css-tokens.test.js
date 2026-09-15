import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findFallbacks,
  listStylesheets,
  report,
} from '../../scripts/check-css-tokens.js';

/** @param {(dir: string) => void} run */
function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'css-tokens-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('listStylesheets returns nested .css files in sorted order', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'b.css'), '');
    writeFileSync(join(dir, 'a.css'), '');
    writeFileSync(join(dir, 'sub', 'c.css'), '');
    writeFileSync(join(dir, 'notes.txt'), '');
    assert.deepEqual(
      listStylesheets(dir).map((p) => p.slice(dir.length + 1)),
      ['a.css', 'b.css', 'sub/c.css'],
    );
  });
});

test('listStylesheets returns nothing for a missing directory', () => {
  assert.deepEqual(listStylesheets('/nonexistent/reno-tracker'), []);
});

test('findFallbacks reports file, line, and text for each fallback', () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, 'base.css'),
      [
        ':root { --border: #ccc; }',
        '.a { color: var(--text); }',
        '.b { border: 1px solid var(--border, #ccc); }',
        '.c { gap: var(--space-2 , 4px); }',
      ].join('\n'),
    );
    const hits = findFallbacks(dir);
    assert.deepEqual(hits, [
      {
        file: 'base.css',
        line: 3,
        text: '.b { border: 1px solid var(--border, #ccc); }',
      },
      { file: 'base.css', line: 4, text: '.c { gap: var(--space-2 , 4px); }' },
    ]);
  });
});

test('findFallbacks passes a clean sheet', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'ok.css'), '.a { color: var(--text); }\n');
    assert.deepEqual(findFallbacks(dir), []);
  });
});

test('report describes a clean run', () => {
  assert.equal(report([]), 'css tokens: no fallbacks found');
});

test('report lists one hit per line and counts them', () => {
  const out = report([
    { file: 'x.css', line: 2, text: '  var(--a, 1)' },
    { file: 'y.css', line: 9, text: 'var(--b, 2)' },
  ]);
  assert.equal(
    out,
    [
      'x.css:2: var(--a, 1)',
      'y.css:9: var(--b, 2)',
      'css tokens: 2 fallbacks. Remove the fallback so a missing token shows as a missing token.',
    ].join('\n'),
  );
});

test('report uses the singular for one hit', () => {
  const out = report([{ file: 'x.css', line: 1, text: 'var(--a, 1)' }]);
  assert.match(out, /1 fallback\. /);
});
