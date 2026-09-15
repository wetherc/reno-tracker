// The browser-side Api. It has the same methods as the fetch client in
// src/api/client.js and runs the same checks the server routes run, so a
// page served from static hosting with no server behaves the same as a
// page served by pnpm dev. Data lives in the browser's localStorage.
import { checkText } from '../entities/validate.js';
import { checkBoolean } from '../entities/validate.js';
import { projectDefaults, validateProject } from '../entities/project.js';
import {
  scheduleItemDefaults,
  validateScheduleItem,
} from '../entities/scheduleItem.js';
import {
  materialItemDefaults,
  validateMaterialItem,
} from '../entities/materialItem.js';
import { asObject, badRequest, pick, rejectInvalid } from './errors.js';
import {
  createProject,
  deleteProject,
  getProjectPayload,
  listProjects,
  patchProject,
  reorderRows,
} from './projects.js';
import {
  createDependency,
  createNote,
  createScheduleItem,
  deleteDependency,
  deleteNote,
  deleteScheduleItem,
  getScheduleItem,
  patchNote,
  patchScheduleItem,
  setScheduleItemComplete,
} from './schedule.js';
import {
  createMaterialItem,
  deleteMaterialItem,
  patchMaterialItem,
  setMaterialItemComplete,
} from './materials.js';
import { createStore } from './store.js';
import { exportProject, importProject, readExportFile } from './transfer.js';

/** @typedef {import('../api/client.js').Api} Api */
/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').ScheduleItemInput} ScheduleItemInput */
/** @typedef {import('../types.ts').MaterialItemInput} MaterialItemInput */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */

const PROJECT_FIELDS = /** @type {const} */ ([
  'name',
  'budgetCents',
  'startDate',
]);
const SCHEDULE_FIELDS = /** @type {const} */ ([
  'title',
  'description',
  'startDate',
  'endDate',
  'responsibleParty',
  'estimatedCents',
  'actualCents',
]);
const MATERIAL_FIELDS = /** @type {const} */ ([
  'scheduleItemId',
  'name',
  'allowanceCents',
  'estimatedCents',
  'actualCents',
  'expectedDate',
]);

/**
 * @param {string} field
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [limits]
 * @returns {string}
 */
function text(field, value, limits) {
  const error = checkText(field, value, limits);
  rejectInvalid(error ? { field, message: error } : null);
  return /** @type {string} */ (value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function boolean(value) {
  const error = checkBoolean('complete', value);
  rejectInvalid(error ? { field: 'complete', message: error } : null);
  return /** @type {boolean} */ (value);
}

/**
 * @param {import('../storage/prefs.js').StorageLike} storage
 * @returns {Api}
 */
export function createLocalApi(storage) {
  const store = createStore(storage);

  /**
   * Reads the document, runs one read, and returns the result.
   * @template T
   * @param {(db: LocalDb) => T} fn
   * @returns {Promise<T>}
   */
  async function query(fn) {
    return fn(store.read());
  }

  /**
   * Reads the document, runs one change, and writes the document back.
   * A thrown check leaves the stored document as it was.
   * @template T
   * @param {(db: LocalDb) => T} fn
   * @returns {Promise<T>}
   */
  async function mutate(fn) {
    const db = store.read();
    const result = fn(db);
    store.write(db);
    return result;
  }

  return {
    listProjects: () => query(listProjects),
    createProject: (input) =>
      mutate((db) => {
        const body = pick(asObject(input), PROJECT_FIELDS);
        rejectInvalid(validateProject(body));
        return createProject(
          db,
          projectDefaults(/** @type {ProjectInput} */ (body)),
        );
      }),
    getProject: (id) => query((db) => getProjectPayload(db, id)),
    patchProject: (id, input) =>
      mutate((db) => {
        const body = pick(asObject(input), PROJECT_FIELDS);
        rejectInvalid(validateProject(body, { partial: true }));
        return patchProject(db, id, /** @type {ProjectInput} */ (body));
      }),
    deleteProject: (id) => mutate((db) => deleteProject(db, id)),

    createScheduleItem: (projectId, input) =>
      mutate((db) => {
        const body = pick(asObject(input), SCHEDULE_FIELDS);
        rejectInvalid(validateScheduleItem(body));
        return createScheduleItem(
          db,
          projectId,
          scheduleItemDefaults(/** @type {ScheduleItemInput} */ (body)),
        );
      }),
    patchScheduleItem: (id, patch) =>
      mutate((db) => {
        const raw = asObject(patch);
        const current = getScheduleItem(db, id);
        const body = pick(raw, SCHEDULE_FIELDS);
        rejectInvalid(validateScheduleItem(body, { partial: true, current }));
        const reason = text('reason', raw.reason ?? '', { max: 500 });
        return patchScheduleItem(
          db,
          id,
          /** @type {ScheduleItemInput} */ (body),
          reason,
        );
      }),
    deleteScheduleItem: (id) => mutate((db) => deleteScheduleItem(db, id)),
    setScheduleComplete: (id, complete) =>
      mutate((db) => setScheduleItemComplete(db, id, boolean(complete))),

    addNote: (itemId, body) =>
      mutate((db) =>
        createNote(db, itemId, text('body', body, { min: 1, max: 5000 })),
      ),
    patchNote: (id, body) =>
      mutate((db) =>
        patchNote(db, id, text('body', body, { min: 1, max: 5000 })),
      ),
    deleteNote: (id) => mutate((db) => deleteNote(db, id)),

    addDependency: (projectId, input) =>
      mutate((db) => {
        const body = asObject(input);
        return createDependency(db, projectId, {
          predecessorId: text('predecessorId', body.predecessorId, {
            min: 1,
            max: 100,
          }),
          successorId: text('successorId', body.successorId, {
            min: 1,
            max: 100,
          }),
        });
      }),
    deleteDependency: (id) => mutate((db) => deleteDependency(db, id)),

    createMaterial: (projectId, input) =>
      mutate((db) => {
        const body = pick(asObject(input), MATERIAL_FIELDS);
        rejectInvalid(validateMaterialItem(body));
        return createMaterialItem(
          db,
          projectId,
          materialItemDefaults(/** @type {MaterialItemInput} */ (body)),
        );
      }),
    patchMaterial: (id, input) =>
      mutate((db) => {
        const body = pick(asObject(input), MATERIAL_FIELDS);
        rejectInvalid(validateMaterialItem(body, { partial: true }));
        return patchMaterialItem(
          db,
          id,
          /** @type {MaterialItemInput} */ (body),
        );
      }),
    deleteMaterial: (id) => mutate((db) => deleteMaterialItem(db, id)),
    setMaterialComplete: (id, complete) =>
      mutate((db) => setMaterialItemComplete(db, id, boolean(complete))),

    reorder: (projectId, kind, ids) =>
      mutate((db) => {
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
          throw badRequest('ids must be a list of ids', 'ids');
        }
        if (kind !== 'schedule' && kind !== 'materials') {
          throw badRequest('kind must be "schedule" or "materials"', 'kind');
        }
        reorderRows(db, kind, projectId, ids);
        return getProjectPayload(db, projectId);
      }),

    exportProject: (id) => query((db) => exportProject(db, id)),
    importProject: (file) =>
      mutate((db) => importProject(db, readExportFile(file))),
  };
}
