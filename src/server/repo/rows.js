// Row mappers. SQLite returns loosely typed rows; each mapper coerces
// one row into its entity so booleans and nullable numbers come out
// with the right JavaScript type.

/** @typedef {Record<string, unknown>} Row */

/** @param {unknown} v */
const text = (v) => String(v);
/** @param {unknown} v */
const int = (v) => Number(v);
/** @param {unknown} v */
const intOrNull = (v) => (v === null ? null : Number(v));
/** @param {unknown} v */
const textOrNull = (v) => (v === null ? null : String(v));
/** @param {unknown} v */
const bool = (v) => v === 1;

/**
 * @param {Row} r
 * @returns {import('../../types.ts').Project}
 */
export function toProject(r) {
  return {
    id: text(r.id),
    name: text(r.name),
    budgetCents: int(r.budgetCents),
    startDate: text(r.startDate),
    createdAt: text(r.createdAt),
  };
}

/**
 * @param {Row} r
 * @returns {import('../../types.ts').ScheduleItem}
 */
export function toScheduleItem(r) {
  return {
    id: text(r.id),
    projectId: text(r.projectId),
    title: text(r.title),
    description: text(r.description),
    startDate: text(r.startDate),
    endDate: text(r.endDate),
    responsibleParty: text(r.responsibleParty),
    estimatedCents: int(r.estimatedCents),
    actualCents: intOrNull(r.actualCents),
    complete: bool(r.complete),
    sortOrder: int(r.sortOrder),
  };
}

/**
 * @param {Row} r
 * @returns {import('../../types.ts').Dependency}
 */
export function toDependency(r) {
  return {
    id: text(r.id),
    projectId: text(r.projectId),
    predecessorId: text(r.predecessorId),
    successorId: text(r.successorId),
  };
}

/**
 * @param {Row} r
 * @returns {import('../../types.ts').Variance}
 */
export function toVariance(r) {
  return {
    id: text(r.id),
    scheduleItemId: text(r.scheduleItemId),
    kind: /** @type {import('../../types.ts').VarianceKind} */ (r.kind),
    field: /** @type {import('../../types.ts').TrackedField} */ (r.field),
    oldValue: textOrNull(r.oldValue),
    newValue: textOrNull(r.newValue),
    reason: text(r.reason),
    loggedAt: text(r.loggedAt),
  };
}

/**
 * @param {Row} r
 * @returns {import('../../types.ts').Note}
 */
export function toNote(r) {
  return {
    id: text(r.id),
    scheduleItemId: text(r.scheduleItemId),
    body: text(r.body),
    createdAt: text(r.createdAt),
    updatedAt: text(r.updatedAt),
  };
}

/**
 * @param {Row} r
 * @returns {import('../../types.ts').MaterialItem}
 */
export function toMaterialItem(r) {
  return {
    id: text(r.id),
    projectId: text(r.projectId),
    scheduleItemId: textOrNull(r.scheduleItemId),
    name: text(r.name),
    allowanceCents: int(r.allowanceCents),
    estimatedCents: int(r.estimatedCents),
    actualCents: intOrNull(r.actualCents),
    complete: bool(r.complete),
    expectedDate: textOrNull(r.expectedDate),
    sortOrder: int(r.sortOrder),
  };
}

/** @returns {string} */
export function now() {
  return new Date().toISOString();
}

/**
 * Builds `SET a = ?, b = ?` and the matching values from a patch object.
 * Booleans become 0 or 1.
 * @param {Record<string, unknown>} patch
 * @returns {{ clause: string, values: import('node:sqlite').SQLInputValue[] }}
 */
export function setClause(patch) {
  const keys = Object.keys(patch);
  return {
    clause: keys.map((k) => `${k} = ?`).join(', '),
    values: keys.map((k) => {
      const v = patch[k];
      return typeof v === 'boolean'
        ? Number(v)
        : /** @type {import('node:sqlite').SQLInputValue} */ (v);
    }),
  };
}
