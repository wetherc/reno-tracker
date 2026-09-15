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
  for (const e of edges) {
    const list = out.get(e.predecessorId) ?? [];
    list.push(e.successorId);
    out.set(e.predecessorId, list);
  }
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
  if (candidate.predecessorId === candidate.successorId) {
    return [candidate.successorId, candidate.successorId];
  }
  const next = successors(edges);
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const path = [];

  /** @param {string} node @returns {boolean} */
  function visit(node) {
    path.push(node);
    if (node === candidate.predecessorId) return true;
    seen.add(node);
    for (const s of next.get(node) ?? []) {
      if (!seen.has(s) && visit(s)) return true;
    }
    path.pop();
    return false;
  }

  if (visit(candidate.successorId)) {
    path.push(candidate.successorId);
    return path;
  }
  return null;
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
    for (const s of list) indegree.set(s, (indegree.get(s) ?? 0) + 1);
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
