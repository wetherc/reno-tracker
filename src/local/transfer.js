// Export builds the same JSON document the server route returns. Import
// checks that document through checkImport, the same check the server
// runs, and creates a new project with fresh ids, so a file can be
// loaded twice without colliding with the project it came from.
import { checkImport, EXPORT_FORMAT } from '../entities/importFile.js';
import { badRequest } from './errors.js';
import { createProject, getProjectPayload } from './projects.js';
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
  return {
    format: EXPORT_FORMAT,
    exportedAt: now(),
    ...getProjectPayload(db, id),
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
  for (const v of file.variances) {
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
  for (const m of file.materials) {
    db.materials.push({
      ...m,
      id: newId(),
      projectId: project.id,
      scheduleItemId:
        m.scheduleItemId === null ? null : mapped(m.scheduleItemId),
    });
  }
  return getProjectPayload(db, project.id);
}
