import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareText } from '../../../src/local/compareText.js';

test('compareText orders by code point, as SQLite orders TEXT', () => {
  assert.equal(compareText('a', 'a'), 0);
  assert.equal(compareText('B', 'a'), -1);
  assert.equal(compareText('a', 'B'), 1);
  assert.equal(compareText('ab', 'abc'), -1);
  assert.equal(compareText('abc', 'ab'), 1);
  assert.equal(compareText('e', 'é'), -1);
  // U+FF21 comes before U+1F600 by code point, but after it by UTF-16
  // code unit.
  assert.equal(compareText('Ａ', '\u{1f600}'), -1);
  assert.equal(compareText('\u{1f600}x', '\u{1f600}y'), -1);
  assert.deepEqual(['b', 'B', 'a', 'A'].sort(compareText), [
    'A',
    'B',
    'a',
    'b',
  ]);
});
