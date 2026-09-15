// Export builds the same JSON document the server route returns. Import
// reads that document and creates a new project with fresh ids, so a
// file can be loaded twice without colliding with the project it came
// from. A row that points at a schedule item the file does not list is
// skipped, because it could never be shown.
import { asObject, badRequest } from './errors.js';
import { createProject, getProjectPayload } from './projects.js';
import { newId, now } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').ExportFile} ExportFile */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

export const EXPORT_FORMAT = 'reno-tracker/1';

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {ExportFile}
 */
export function exportProject(db, id) {
  return {
    format: EXPORT_FORMAT,
    exportedAt: now(),
    ...getProjectPayload(db, id),
  };
}

/**
 * @param {unknown} body
 * @returns {ExportFile}
 */
export function readExportFile(body) {
  const input = asObject(body);
  if (input.format !== EXPORT_FORMAT) {
    throw badRequest(`format must be "${EXPORT_FORMAT}"`, 'format');
  }
  const project = asObject(input.project);
  if (
    typeof project.name !== 'string' ||
    typeof project.startDate !== 'string'
  ) {
    throw badRequest('project needs a name and a startDate', 'project');
  }
  for (const key of [
    'schedule',
    'dependencies',
    'variances',
    'notes',
    'materials',
  ]) {
    if (!Array.isArray(input[key]))
      throw badRequest(`${key} must be a list`, key);
  }
  return /** @type {ExportFile} */ (/** @type {unknown} */ (input));
}

/**
 * @param {LocalDb} db
 * @param {ExportFile} file
 * @returns {ProjectPayload}
 */
export function importProject(db, file) {
  const project = createProject(db, {
    name: file.project.name,
    budgetCents: Number(file.project.budgetCents) || 0,
    startDate: file.project.startDate,
  });
  /** @type {Map<string, string>} */
  const ids = new Map();
  /** @param {string} old */
  const fresh = (old) => {
    const id = newId();
    ids.set(old, id);
    return id;
  };
  /** @param {string | null | undefined} old */
  const mapped = (old) => (old == null ? null : (ids.get(old) ?? null));

  file.schedule.forEach((s, i) =>
    db.schedule.push({
      id: fresh(s.id),
      projectId: project.id,
      title: s.title,
      description: s.description ?? '',
      startDate: s.startDate,
      endDate: s.endDate,
      responsibleParty: s.responsibleParty ?? '',
      estimatedCents: s.estimatedCents ?? 0,
      actualCents: s.actualCents ?? null,
      complete: Boolean(s.complete),
      sortOrder: s.sortOrder ?? i,
    }),
  );
  for (const d of file.dependencies) {
    const predecessorId = mapped(d.predecessorId);
    const successorId = mapped(d.successorId);
    if (!predecessorId || !successorId) continue;
    db.dependencies.push({
      id: newId(),
      projectId: project.id,
      predecessorId,
      successorId,
    });
  }
  for (const v of file.variances) {
    const scheduleItemId = mapped(v.scheduleItemId);
    if (!scheduleItemId) continue;
    db.variances.push({
      id: newId(),
      scheduleItemId,
      kind: v.kind,
      field: v.field,
      oldValue: v.oldValue ?? null,
      newValue: v.newValue ?? null,
      reason: v.reason ?? '',
      loggedAt: v.loggedAt,
    });
  }
  for (const n of file.notes) {
    const scheduleItemId = mapped(n.scheduleItemId);
    if (!scheduleItemId) continue;
    db.notes.push({
      id: newId(),
      scheduleItemId,
      body: n.body,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    });
  }
  file.materials.forEach((m, i) =>
    db.materials.push({
      id: newId(),
      projectId: project.id,
      scheduleItemId: mapped(m.scheduleItemId),
      name: m.name,
      allowanceCents: m.allowanceCents ?? 0,
      estimatedCents: m.estimatedCents ?? 0,
      actualCents: m.actualCents ?? null,
      complete: Boolean(m.complete),
      expectedDate: m.expectedDate ?? null,
      sortOrder: m.sortOrder ?? i,
    }),
  );
  return getProjectPayload(db, project.id);
}
