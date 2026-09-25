// Export writes one project as a JSON file. Import checks that file
// through checkImport and creates a new project with fresh ids, so a
// file can be loaded twice without colliding with the project it came
// from.
import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { badRequest } from '../errors.js';
import {
  createProject,
  getProjectPayload,
  getProjectVariances,
} from '../repo/projects.js';
import { insertPayments } from '../repo/invoices.js';
import { now } from '../repo/rows.js';
import { checkImport, EXPORT_FORMAT } from '../../entities/importFile.js';
import { statement } from '../repo/statements.js';

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
  const { project, schedule, dependencies, notes, materials, invoices } =
    getProjectPayload(db, id);
  return {
    format: EXPORT_FORMAT,
    exportedAt: now(),
    project,
    schedule,
    dependencies,
    variances: getProjectVariances(db, id),
    notes,
    materials,
    invoices,
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

    const item = statement(
      db,
      `INSERT INTO schedule_items (id, projectId, title, description, startDate, endDate,
         responsibleParty, estimatedCents, actualCents, markupBasisPoints,
         complete, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        s.markupBasisPoints,
        Number(s.complete),
        s.sortOrder,
      );
    }
    const dep = statement(
      db,
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
    const variance = statement(
      db,
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
    const note = statement(
      db,
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
    /** @type {Map<string, string>} */
    const materialIds = new Map();
    const material = statement(
      db,
      `INSERT INTO material_items (id, projectId, scheduleItemId, name, allowanceCents,
         estimatedCents, actualCents, markupBasisPoints, complete, expectedDate,
         sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of file.materials) {
      const id = randomUUID();
      if (m.id !== null) materialIds.set(m.id, id);
      material.run(
        id,
        project.id,
        m.scheduleItemId === null ? null : mapped(m.scheduleItemId),
        m.name,
        m.allowanceCents,
        m.estimatedCents,
        m.actualCents,
        m.markupBasisPoints,
        Number(m.complete),
        m.expectedDate,
        m.sortOrder,
      );
    }
    const invoice = statement(
      db,
      `INSERT INTO invoices
         (id, projectId, number, party, issuedDate, dueDate,
          markupBasisPoints, retainageCents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const line = statement(
      db,
      `INSERT INTO invoice_lines (id, invoiceId, position, scheduleItemId,
         materialItemId, description, amountCents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const inv of file.invoices) {
      const id = randomUUID();
      invoice.run(
        id,
        project.id,
        inv.number,
        inv.party,
        inv.issuedDate,
        inv.dueDate,
        inv.markupBasisPoints,
        inv.retainageCents,
      );
      insertPayments(db, id, inv.payments);
      inv.lines.forEach((l, i) =>
        line.run(
          randomUUID(),
          id,
          i,
          l.scheduleItemId === null ? null : mapped(l.scheduleItemId),
          l.materialItemId === null
            ? null
            : /** @type {string} */ (materialIds.get(l.materialItemId)),
          l.description,
          l.amountCents,
        ),
      );
    }
    return getProjectPayload(db, project.id);
  });
}

/**
 * The body limit for import. Export has no limit and the change log
 * grows with every edit, so a saved file can pass the 1 MB default that
 * other routes keep.
 */
export const IMPORT_MAX_BYTES = 25_000_000;

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
  router.post(
    '/api/projects/import',
    ({ body }) => importProject(db, checkImport(body, fail)),
    { maxBytes: IMPORT_MAX_BYTES },
  );
}
