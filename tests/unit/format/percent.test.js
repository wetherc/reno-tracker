import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPercent,
  parsePercent,
  percentToInput,
} from '../../../src/format/percent.js';

test('percentToInput and formatPercent drop trailing zeros', () => {
  assert.equal(percentToInput(1500), '15');
  assert.equal(percentToInput(1250), '12.5');
  assert.equal(percentToInput(725), '7.25');
  assert.equal(percentToInput(5), '0.05');
  assert.equal(percentToInput(0), '0');
  assert.equal(formatPercent(1250), '12.5%');
});

test('parsePercent reads typed percents exactly', () => {
  assert.equal(parsePercent('15'), 1500);
  assert.equal(parsePercent(' 15 % '), 1500);
  assert.equal(parsePercent('12.5'), 1250);
  assert.equal(parsePercent('0.29'), 29);
  assert.equal(parsePercent('7.'), 700);
  assert.equal(parsePercent(''), 0);
  assert.equal(parsePercent('100'), 10_000);
});

test('parsePercent rejects junk and rates over 100', () => {
  for (const bad of [
    '100.01',
    '101',
    '-5',
    '12.345',
    '.5',
    'abc',
    '1e2',
    '1 5',
    '1 5%',
  ]) {
    assert.equal(parsePercent(bad), null, bad);
  }
});
