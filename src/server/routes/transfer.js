// Export writes one project as a JSON file. Import reads that file and
// creates a new project with fresh ids, so a file can be loaded twice
// without colliding with the project it came from.
import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { badRequest } from '../errors.js';
import { createProject, getProjectPayload } from '../repo/projects.js';
import { now } from '../repo/rows.js';
import { asObject } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */
/** @typedef {import('../../types.ts').ExportFile} ExportFile */

export const EXPORT_FORMAT = 'reno-tracker/1';

/**
 * @param {Database} db
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
function readExportFile(body) {
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
 * Inserts every row of the file under a new project id. Row ids are
 * remapped through one table so links between rows stay intact.
 * @param {Database} db
 * @param {ExportFile} file
 * @returns {import('../../types.ts').ProjectPayload}
 */
export function importProject(db, file) {
  return withTransaction(db, () => {
    const project = createProject(db, {
      name: file.project.name,
      budgetCents: Number(file.project.budgetCents) || 0,
      startDate: file.project.startDate,
    });
    /** @type {Map<string, string>} */
    const ids = new Map();
    /** @param {string} old */
    const fresh = (old) => {
      const id = randomUUID();
      ids.set(old, id);
      return id;
    };
    /** @param {string | null} old */
    const mapped = (old) =>
      old === null || old === undefined ? null : (ids.get(old) ?? null);

    const item = db.prepare(
      `INSERT INTO schedule_items (id, projectId, title, description, startDate, endDate,
         responsibleParty, estimatedCents, actualCents, complete, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    file.schedule.forEach((s, i) =>
      item.run(
        fresh(s.id),
        project.id,
        s.title,
        s.description ?? '',
        s.startDate,
        s.endDate,
        s.responsibleParty ?? '',
        s.estimatedCents ?? 0,
        s.actualCents ?? null,
        Number(Boolean(s.complete)),
        s.sortOrder ?? i,
      ),
    );
    const dep = db.prepare(
      'INSERT INTO dependencies (id, projectId, predecessorId, successorId) VALUES (?, ?, ?, ?)',
    );
    for (const d of file.dependencies) {
      dep.run(
        randomUUID(),
        project.id,
        mapped(d.predecessorId),
        mapped(d.successorId),
      );
    }
    const variance = db.prepare(
      `INSERT INTO variances (id, scheduleItemId, kind, field, oldValue, newValue, reason, loggedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const v of file.variances) {
      variance.run(
        randomUUID(),
        mapped(v.scheduleItemId),
        v.kind,
        v.field,
        v.oldValue ?? null,
        v.newValue ?? null,
        v.reason ?? '',
        v.loggedAt,
      );
    }
    const note = db.prepare(
      'INSERT INTO notes (id, scheduleItemId, body, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    );
    for (const n of file.notes) {
      note.run(
        randomUUID(),
        mapped(n.scheduleItemId),
        n.body,
        n.createdAt,
        n.updatedAt,
      );
    }
    const material = db.prepare(
      `INSERT INTO material_items (id, projectId, scheduleItemId, name, allowanceCents,
         estimatedCents, actualCents, complete, expectedDate, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    file.materials.forEach((m, i) =>
      material.run(
        randomUUID(),
        project.id,
        mapped(m.scheduleItemId),
        m.name,
        m.allowanceCents ?? 0,
        m.estimatedCents ?? 0,
        m.actualCents ?? null,
        Number(Boolean(m.complete)),
        m.expectedDate ?? null,
        m.sortOrder ?? i,
      ),
    );
    return getProjectPayload(db, project.id);
  });
}

/**
 * @param {Router} router
 * @param {Database} db
 */
export function transferRoutes(router, db) {
  router.get('/api/projects/:id/export', ({ params }) =>
    exportProject(db, params.id),
  );
  router.post('/api/projects/import', ({ body }) =>
    importProject(db, readExportFile(body)),
  );
}
