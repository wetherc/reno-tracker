// Export writes one project as a JSON file. Import checks that file
// through checkImport and creates a new project with fresh ids, so a
// file can be loaded twice without colliding with the project it came
// from.
import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { badRequest } from '../errors.js';
import { createProject, getProjectPayload } from '../repo/projects.js';
import { now } from '../repo/rows.js';
import { checkImport, EXPORT_FORMAT } from '../../entities/importFile.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */
/** @typedef {import('../../types.ts').ExportFile} ExportFile */
/** @typedef {import('../../types.ts').ImportRows} ImportRows */

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
 * Inserts the checked rows under a new project id. Row ids are remapped
 * through one table so links between rows stay intact.
 * @param {Database} db
 * @param {ImportRows} file
 * @returns {import('../../types.ts').ProjectPayload}
 */
export function importProject(db, file) {
  return withTransaction(db, () => {
    const project = createProject(db, file.project);
    /** @type {Map<string, string>} */
    const ids = new Map(file.schedule.map((s) => [s.id, randomUUID()]));
    /** @param {string} old */
    const mapped = (old) => /** @type {string} */ (ids.get(old));

    const item = db.prepare(
      `INSERT INTO schedule_items (id, projectId, title, description, startDate, endDate,
         responsibleParty, estimatedCents, actualCents, complete, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of file.schedule) {
      item.run(
        mapped(s.id),
        project.id,
        s.title,
        s.description,
        s.startDate,
        s.endDate,
        s.responsibleParty,
        s.estimatedCents,
        s.actualCents,
        Number(s.complete),
        s.sortOrder,
      );
    }
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
        v.oldValue,
        v.newValue,
        v.reason,
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
    for (const m of file.materials) {
      material.run(
        randomUUID(),
        project.id,
        m.scheduleItemId === null ? null : mapped(m.scheduleItemId),
        m.name,
        m.allowanceCents,
        m.estimatedCents,
        m.actualCents,
        Number(m.complete),
        m.expectedDate,
        m.sortOrder,
      );
    }
    return getProjectPayload(db, project.id);
  });
}

/** @type {import('../../entities/importFile.js').Fail} */
function fail(error) {
  throw badRequest(error.message, error.field || undefined);
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
    importProject(db, checkImport(body, fail)),
  );
}
