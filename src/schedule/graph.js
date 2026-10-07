// Dependency graph helpers. Edges point from predecessor to successor.

/** @typedef {{ predecessorId: string, successorId: string }} Edge */

/**
 * Builds a successor list per node.
 * @param {Edge[]} edges
 * @returns {Map<string, string[]>}
 */
function successors(edges) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const e of edges) addEdge(out, e);
  return out;
}

/**
 * Returns the path the new edge would close, as node ids starting and
 * ending at `successorId`, or null when the edge is safe. Depth-first
 * search from the new successor looks for a route back to the new
 * predecessor.
 * @param {Edge[]} edges existing edges
 * @param {Edge} candidate
 * @returns {string[] | null}
 */
export function findCycle(edges, candidate) {
  return findCycleIn(successors(edges), candidate);
}

/**
 * The same check as findCycle, over a successor list per node. The search
 * keeps its own stack rather than recursing, so a chain of many thousand
 * items cannot overflow the call stack.
 * @param {Map<string, string[]>} next
 * @param {Edge} candidate
 * @returns {string[] | null}
 */
export function findCycleIn(next, candidate) {
  const target = candidate.predecessorId;
  const start = candidate.successorId;
  if (target === start) return [start, start];
  /** @type {Set<string>} */
  const seen = new Set([start]);
  /** @type {string[]} */
  const path = [start];
  /** @type {Iterator<string>[]} */
  const stack = [(next.get(start) ?? []).values()];
  while (stack.length > 0) {
    if (path[path.length - 1] === target) return [...path, start];
    const step = stack[stack.length - 1].next();
    if (step.done) {
      stack.pop();
      path.pop();
    } else if (!seen.has(step.value)) {
      seen.add(step.value);
      path.push(step.value);
      stack.push((next.get(step.value) ?? []).values());
    }
  }
  return null;
}

/**
 * Adds one edge to a successor list made by successors or by hand.
 * @param {Map<string, string[]>} next
 * @param {Edge} edge
 */
export function addEdge(next, edge) {
  const list = next.get(edge.predecessorId);
  if (list) list.push(edge.successorId);
  else next.set(edge.predecessorId, [edge.successorId]);
}

/**
 * Orders ids so every predecessor comes before its successors. Ties keep
 * the input order. Ids that are not in `ids` are ignored on edges.
 * @param {string[]} ids
 * @param {Edge[]} edges
 * @returns {string[]}
 */
export function topologicalOrder(ids, edges) {
  const index = new Map(ids.map((id, i) => [id, i]));
  /** @type {Map<string, number>} */
  const indegree = new Map(ids.map((id) => [id, 0]));
  const next = successors(
    edges.filter((e) => index.has(e.predecessorId) && index.has(e.successorId)),
  );
  for (const list of next.values()) {
    for (const s of list) indegree.set(s, Number(indegree.get(s)) + 1);
  }
  let ready = ids.filter((id) => indegree.get(id) === 0);
  /** @type {string[]} */
  const out = [];
  while (ready.length > 0) {
    const id = /** @type {string} */ (ready.shift());
    out.push(id);
    for (const s of next.get(id) ?? []) {
      const left = /** @type {number} */ (indegree.get(s)) - 1;
      indegree.set(s, left);
      if (left === 0) ready.push(s);
    }
    ready.sort(
      (a, b) =>
        /** @type {number} */ (index.get(a)) -
        /** @type {number} */ (index.get(b)),
    );
  }
  return out;
}
