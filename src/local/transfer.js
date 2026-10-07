// Export builds the same JSON document the server route returns. Import
// checks that document through checkImport, the same check the server
// runs, and creates a new project with fresh ids, so a file can be
// loaded twice without colliding with the project it came from.
import { checkImport, EXPORT_FORMAT } from '../entities/importFile.js';
import { badRequest } from './errors.js';
import {
  createProject,
  getProjectPayload,
  getProjectVariances,
} from './projects.js';
import { withIds } from './invoices.js';
import { newestChanges } from './schedule.js';
import { newId, now } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').ExportFile} ExportFile */
/** @typedef {import('../types.ts').ImportRows} ImportRows */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {ExportFile}
 */
export function exportProject(db, id) {
  const {
    project,
    schedule,
    dependencies,
    notes,
    materials,
    invoices,
    changeOrders,
  } = getProjectPayload(db, id);
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
    changeOrders,
  };
}

/**
 * @param {unknown} body
 * @returns {ImportRows}
 */
export function readExportFile(body) {
  return checkImport(body, (error) => {
    throw badRequest(error.message, error.field || undefined);
  });
}

/**
 * @param {LocalDb} db
 * @param {ImportRows} file
 * @returns {ProjectPayload}
 */
export function importProject(db, file) {
  const project = createProject(db, file.project);
  /** @type {Map<string, string>} */
  const ids = new Map(file.schedule.map((s) => [s.id, newId()]));
  /** @param {string} old */
  const mapped = (old) => /** @type {string} */ (ids.get(old));

  for (const s of file.schedule) {
    db.schedule.push({ ...s, id: mapped(s.id), projectId: project.id });
  }
  for (const d of file.dependencies) {
    db.dependencies.push({
      id: newId(),
      projectId: project.id,
      predecessorId: mapped(d.predecessorId),
      successorId: mapped(d.successorId),
    });
  }
  // The store keeps only the newest change rows of each item, as it does
  // after an edit, because the browser holds about 5 MB per site.
  for (const v of newestChanges(file.variances)) {
    db.variances.push({
      ...v,
      id: newId(),
      scheduleItemId: mapped(v.scheduleItemId),
    });
  }
  for (const n of file.notes) {
    db.notes.push({
      ...n,
      id: newId(),
      scheduleItemId: mapped(n.scheduleItemId),
    });
  }
  /** @type {Map<string, string>} */
  const materialIds = new Map();
  for (const { id: old, ...m } of file.materials) {
    const id = newId();
    if (old !== null) materialIds.set(old, id);
    db.materials.push({
      ...m,
      id,
      projectId: project.id,
      scheduleItemId:
        m.scheduleItemId === null ? null : mapped(m.scheduleItemId),
    });
  }
  /** @param {import('../types.ts').NewLineItem[]} lines */
  const mappedLines = (lines) =>
    lines.map((line) => ({
      ...line,
      id: newId(),
      scheduleItemId:
        line.scheduleItemId === null ? null : mapped(line.scheduleItemId),
      materialItemId:
        line.materialItemId === null
          ? null
          : /** @type {string} */ (materialIds.get(line.materialItemId)),
    }));
  for (const invoice of file.invoices) {
    db.invoices.push({
      ...invoice,
      id: newId(),
      projectId: project.id,
      lines: mappedLines(invoice.lines),
      payments: withIds(invoice.payments),
    });
  }
  for (const order of file.changeOrders) {
    db.changeOrders.push({
      ...order,
      id: newId(),
      projectId: project.id,
      lines: mappedLines(order.lines),
    });
  }
  return getProjectPayload(db, project.id);
}
