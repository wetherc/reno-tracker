import { test } from 'node:test';
import assert from 'node:assert/strict';
import { now, setClause } from '../../../../src/server/repo/rows.js';

test('setClause lists each key and turns booleans into 0 or 1', () => {
  assert.deepEqual(setClause({ title: 'Demo', complete: true, done: false }), {
    clause: 'title = ?, complete = ?, done = ?',
    values: ['Demo', 1, 0],
  });
  assert.deepEqual(setClause({}), { clause: '', values: [] });
});

test('now is an ISO timestamp', () => {
  assert.match(now(), /^\d{4}-\d{2}-\d{2}T/);
});
