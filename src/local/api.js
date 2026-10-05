// The browser-side Api. It has the same methods as the fetch client in
// src/api/client.js and runs the same checks the server routes run, so a
// page served from static hosting with no server behaves the same as a
// page served by pnpm dev. Data lives in the browser's localStorage.
// Every result is a copy, so a caller that changes a returned row cannot
// change the store's memory copy.
import { checkText } from '../entities/validate.js';
import { checkBoolean } from '../entities/validate.js';
import {
  PROJECT_FIELDS,
  projectDefaults,
  validateProject,
} from '../entities/project.js';
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
  getProject,
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
  listChanges,
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
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  patchInvoice,
} from './invoices.js';
import {
  createChangeOrder,
  deleteChangeOrder,
  patchChangeOrder,
} from './changeOrders.js';
import {
  CHANGE_ORDER_FIELDS,
  changeOrderDefaults,
  cleanChangeOrderInput,
  validateChangeOrder,
} from '../entities/changeOrder.js';
import {
  cleanInvoiceInput,
  INVOICE_FIELDS,
  invoiceDefaults,
  validateInvoice,
} from '../entities/invoice.js';
import { createStore, projectOf } from './store.js';
import { exportProject, importProject, readExportFile } from './transfer.js';

/** @typedef {import('../api/client.js').Api} Api */
/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('./store.js').RowKind} RowKind */
/** @typedef {import('../types.ts').ScheduleItemInput} ScheduleItemInput */
/** @typedef {import('../types.ts').MaterialItemInput} MaterialItemInput */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */

const SCHEDULE_FIELDS = /** @type {const} */ ([
  'title',
  'description',
  'startDate',
  'endDate',
  'responsibleParty',
  'estimatedCents',
  'actualCents',
  'markupBasisPoints',
]);
const MATERIAL_FIELDS = /** @type {const} */ ([
  'scheduleItemId',
  'name',
  'allowanceCents',
  'estimatedCents',
  'actualCents',
  'markupBasisPoints',
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
 * @param {RowKind} kind
 * @param {string} id
 * @returns {(db: LocalDb) => string | null}
 */
const owner = (kind, id) => (db) => projectOf(db, kind, id);

/**
 * @param {import('../storage/prefs.js').StorageLike} storage
 * @param {Pick<EventTarget, 'addEventListener'>} [events] the window, whose storage event reports a write from another tab
 * @returns {Api}
 */
export function createLocalApi(storage, events) {
  const store = createStore(storage);
  events?.addEventListener('storage', (event) => {
    store.forget(/** @type {StorageEvent} */ (event).key);
  });

  /**
   * Runs one read.
   * @template T
   * @param {(db: LocalDb) => T} fn
   * @returns {Promise<T>}
   */
  async function query(fn) {
    return structuredClone(fn(store.read()));
  }

  /**
   * Runs one change to the project that `whose` names and stores that
   * project. A thrown check leaves the stored project as it was.
   * @template T
   * @param {(db: LocalDb) => string | null} whose
   * @param {(db: LocalDb) => T} fn
   * @returns {Promise<T>}
   */
  async function mutate(whose, fn) {
    return structuredClone(store.change(whose, fn));
  }

  /**
   * Runs one change that makes a new project and stores it.
   * @template T
   * @param {(db: LocalDb) => T} fn
   * @param {(result: T) => string} idOf
   * @returns {Promise<T>}
   */
  async function create(fn, idOf) {
    return structuredClone(store.create(fn, idOf));
  }

  return {
    listProjects: () => query(listProjects),
    createProject: (input) =>
      create(
        (db) => {
          const body = pick(asObject(input), PROJECT_FIELDS);
          rejectInvalid(validateProject(body));
          return createProject(
            db,
            projectDefaults(/** @type {ProjectInput} */ (body)),
          );
        },
        (project) => project.id,
      ),
    getProject: (id) => query((db) => getProjectPayload(db, id)),
    patchProject: (id, input) =>
      mutate(owner('project', id), (db) => {
        const body = pick(asObject(input), PROJECT_FIELDS);
        rejectInvalid(validateProject(body, { partial: true }));
        return patchProject(db, id, /** @type {ProjectInput} */ (body));
      }),
    deleteProject: (id) =>
      mutate(owner('project', id), (db) => deleteProject(db, id)),

    createScheduleItem: (projectId, input) =>
      mutate(owner('project', projectId), (db) => {
        const body = pick(asObject(input), SCHEDULE_FIELDS);
        rejectInvalid(validateScheduleItem(body));
        return createScheduleItem(
          db,
          projectId,
          scheduleItemDefaults(/** @type {ScheduleItemInput} */ (body)),
        );
      }),
    patchScheduleItem: (id, patch) =>
      mutate(owner('schedule', id), (db) => {
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
    deleteScheduleItem: (id) =>
      mutate(owner('schedule', id), (db) => deleteScheduleItem(db, id)),
    setScheduleComplete: (id, complete) =>
      mutate(owner('schedule', id), (db) =>
        setScheduleItemComplete(db, id, boolean(complete)),
      ),
    listChanges: (id) => query((db) => listChanges(db, id)),

    addNote: (itemId, body) =>
      mutate(owner('schedule', itemId), (db) =>
        createNote(db, itemId, text('body', body, { min: 1, max: 5000 })),
      ),
    patchNote: (id, body) =>
      mutate(owner('notes', id), (db) =>
        patchNote(db, id, text('body', body, { min: 1, max: 5000 })),
      ),
    deleteNote: (id) => mutate(owner('notes', id), (db) => deleteNote(db, id)),

    addDependency: (projectId, input) =>
      mutate(owner('project', projectId), (db) => {
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
    deleteDependency: (id) =>
      mutate(owner('dependencies', id), (db) => deleteDependency(db, id)),

    createMaterial: (projectId, input) =>
      mutate(owner('project', projectId), (db) => {
        const body = pick(asObject(input), MATERIAL_FIELDS);
        rejectInvalid(validateMaterialItem(body));
        return createMaterialItem(
          db,
          projectId,
          materialItemDefaults(/** @type {MaterialItemInput} */ (body)),
        );
      }),
    patchMaterial: (id, input) =>
      mutate(owner('materials', id), (db) => {
        const body = pick(asObject(input), MATERIAL_FIELDS);
        rejectInvalid(validateMaterialItem(body, { partial: true }));
        return patchMaterialItem(
          db,
          id,
          /** @type {MaterialItemInput} */ (body),
        );
      }),
    deleteMaterial: (id) =>
      mutate(owner('materials', id), (db) => deleteMaterialItem(db, id)),
    setMaterialComplete: (id, complete) =>
      mutate(owner('materials', id), (db) =>
        setMaterialItemComplete(db, id, boolean(complete)),
      ),

    createInvoice: (projectId, input) =>
      mutate(owner('project', projectId), (db) => {
        const body = pick(asObject(input), INVOICE_FIELDS);
        rejectInvalid(validateInvoice(body));
        const { markupBasisPoints } = getProject(db, projectId);
        return createInvoice(
          db,
          projectId,
          invoiceDefaults(cleanInvoiceInput(body), markupBasisPoints),
        );
      }),
    patchInvoice: (id, input) =>
      mutate(owner('invoices', id), (db) => {
        const body = pick(asObject(input), INVOICE_FIELDS);
        const current = getInvoice(db, id);
        rejectInvalid(validateInvoice(body, { partial: true, current }));
        return patchInvoice(db, id, cleanInvoiceInput(body));
      }),
    deleteInvoice: (id) =>
      mutate(owner('invoices', id), (db) => deleteInvoice(db, id)),

    createChangeOrder: (projectId, input) =>
      mutate(owner('project', projectId), (db) => {
        const body = pick(asObject(input), CHANGE_ORDER_FIELDS);
        rejectInvalid(validateChangeOrder(body));
        return createChangeOrder(
          db,
          projectId,
          changeOrderDefaults(cleanChangeOrderInput(body)),
        );
      }),
    patchChangeOrder: (id, input) =>
      mutate(owner('changeOrders', id), (db) => {
        const body = pick(asObject(input), CHANGE_ORDER_FIELDS);
        rejectInvalid(validateChangeOrder(body, { partial: true }));
        return patchChangeOrder(db, id, cleanChangeOrderInput(body));
      }),
    deleteChangeOrder: (id) =>
      mutate(owner('changeOrders', id), (db) => deleteChangeOrder(db, id)),

    reorder: (projectId, kind, ids) =>
      mutate(owner('project', projectId), (db) => {
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
      create(
        (db) => importProject(db, readExportFile(file)),
        (payload) => payload.project.id,
      ),
  };
}
