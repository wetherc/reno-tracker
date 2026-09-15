import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centsToInput,
  formatCents,
  parseMoney,
} from '../../../src/format/money.js';

test('formatCents', () => {
  assert.equal(formatCents(123456), '$1,234.56');
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(null), '—');
  assert.equal(formatCents(undefined), '—');
});

test('parseMoney accepts typed money and rejects junk', () => {
  assert.equal(parseMoney('$1,234.56'), 123456);
  assert.equal(parseMoney('1234.5'), 123450);
  assert.equal(parseMoney(' 1234 '), 123400);
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('-5'), -500);
  assert.equal(parseMoney('.'), null);
  assert.equal(parseMoney('-'), null);
  assert.equal(parseMoney('12.345'), null);
  assert.equal(parseMoney('abc'), null);
});

test('centsToInput', () => {
  assert.equal(centsToInput(123456), '1234.56');
  assert.equal(centsToInput(5), '0.05');
  assert.equal(centsToInput(null), '');
  assert.equal(centsToInput(undefined), '');
});
