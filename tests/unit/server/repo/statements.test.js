import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { statement } from '../../../../src/server/repo/statements.js';

test('statement prepares each SQL text once per database', () => {
  const one = new DatabaseSync(':memory:');
  const two = new DatabaseSync(':memory:');
  const first = statement(one, 'SELECT 1 AS n');
  assert.equal(statement(one, 'SELECT 1 AS n'), first);
  assert.notEqual(statement(one, 'SELECT 2 AS n'), first);
  assert.notEqual(statement(two, 'SELECT 1 AS n'), first);
  assert.deepEqual({ ...first.get() }, { n: 1 });
  one.close();
  two.close();
});
