import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBoolean,
  checkCents,
  checkDate,
  checkText,
  firstError,
  nullable,
} from '../../../src/entities/validate.js';

test('checkText reports type, blank, and length', () => {
  assert.equal(checkText('name', 'ok'), null);
  assert.equal(checkText('name', 12), 'name must be text, got 12');
  assert.equal(
    checkText('name', undefined),
    'name must be text, got undefined',
  );
  assert.equal(checkText('name', '  ', { min: 1 }), 'name cannot be blank');
  assert.equal(
    checkText('name', 'abc', { max: 2 }),
    'name is over 2 characters',
  );
});

test('checkCents wants a whole number of zero or more', () => {
  assert.equal(checkCents('budgetCents', 0), null);
  assert.equal(checkCents('budgetCents', 1250), null);
  assert.equal(
    checkCents('budgetCents', 12.5),
    'budgetCents must be whole cents, zero or more, got 12.5',
  );
  assert.equal(
    checkCents('budgetCents', -1),
    'budgetCents must be whole cents, zero or more, got -1',
  );
  assert.equal(
    checkCents('budgetCents', '100'),
    'budgetCents must be whole cents, zero or more, got "100"',
  );
});

test('checkDate shows the offending value', () => {
  assert.equal(checkDate('startDate', '2026-03-14'), null);
  assert.equal(
    checkDate('startDate', '2026-3-14'),
    'startDate must be a date like 2026-03-14, got "2026-3-14"',
  );
});

test('nullable lets null through and checks anything else', () => {
  const check = nullable(checkCents);
  assert.equal(check('actualCents', null), null);
  assert.equal(check('actualCents', 5), null);
  assert.match(check('actualCents', 'x') ?? '', /whole cents/);
});

test('checkBoolean', () => {
  assert.equal(checkBoolean('complete', true), null);
  assert.equal(
    checkBoolean('complete', 1),
    'complete must be true or false, got 1',
  );
});

test('firstError skips absent optional fields and demands required ones', () => {
  const checks = { a: checkCents, b: checkCents };
  assert.equal(firstError({ a: 1 }, checks), null);
  assert.deepEqual(firstError({ a: 1 }, checks, ['b']), {
    field: 'b',
    message: 'b must be whole cents, zero or more, got undefined',
  });
  assert.deepEqual(firstError({ a: -1, b: -1 }, checks), {
    field: 'a',
    message: 'a must be whole cents, zero or more, got -1',
  });
});
