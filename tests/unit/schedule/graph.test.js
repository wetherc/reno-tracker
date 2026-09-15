import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCycle, topologicalOrder } from '../../../src/schedule/graph.js';

/** @param {string} p @param {string} s */
const edge = (p, s) => ({ predecessorId: p, successorId: s });

test('findCycle returns null for a safe edge', () => {
  assert.equal(findCycle([edge('a', 'b')], edge('b', 'c')), null);
  assert.equal(findCycle([], edge('a', 'b')), null);
});

test('findCycle rejects a self edge', () => {
  assert.deepEqual(findCycle([], edge('a', 'a')), ['a', 'a']);
});

test('findCycle walks the loop from the new successor back around', () => {
  const edges = [edge('a', 'b'), edge('b', 'c')];
  assert.deepEqual(findCycle(edges, edge('c', 'a')), ['a', 'b', 'c', 'a']);
});

test('findCycle ignores branches that do not reach the predecessor', () => {
  const edges = [
    edge('a', 'x'),
    edge('a', 'b'),
    edge('x', 'y'),
    edge('b', 'c'),
  ];
  assert.deepEqual(findCycle(edges, edge('c', 'a')), ['a', 'b', 'c', 'a']);
  assert.equal(findCycle(edges, edge('y', 'c')), null);
});

test('topologicalOrder puts predecessors first and keeps input order for ties', () => {
  const ids = ['c', 'b', 'a', 'd'];
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('zzz', 'c')];
  assert.deepEqual(topologicalOrder(ids, edges), ['a', 'b', 'c', 'd']);
});

test('topologicalOrder with no edges is the input order', () => {
  assert.deepEqual(topologicalOrder(['b', 'a'], []), ['b', 'a']);
});

test('topologicalOrder drops nodes stuck in a loop', () => {
  assert.deepEqual(
    topologicalOrder(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'a')]),
    ['c'],
  );
});
