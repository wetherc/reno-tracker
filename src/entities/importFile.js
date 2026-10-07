// Checks an export file before import and returns clean rows. The server
// and the browser store both import through this one function, so a
// file gets the same answer from both backends.
//
// A bad value in a kept row stops the import with a message that names
// the list and the row number. A note or change row that points at an
// item the file does not list is dropped, and so is a dependency with
// an unknown end or a second copy of an edge, because nothing could
// show them. A material that points at an unknown item is kept with no
// link. A material keeps its file id, if it has one, so a line of an
// invoice or a change order can name it. A dependency on itself or a
// loop of dependencies stops the import, because the Gantt drops every
// item in a loop.
import {
  scheduleItemDefaults,
  TRACKED_FIELDS,
  validateScheduleItem,
} from './scheduleItem.js';
import { materialItemDefaults, validateMaterialItem } from './materialItem.js';
import { PROJECT_FIELDS, projectDefaults, validateProject } from './project.js';
import { checkBoolean, checkText, checkTimestamp, show } from './validate.js';
import { addEdge, findCycleIn } from '../schedule/graph.js';
import { checkDocs } from './importDocs.js';
import {
  CHANGE_ORDER_FIELDS,
  changeOrderDefaults,
  cleanChangeOrderInput,
  validateChangeOrder,
} from './changeOrder.js';
import {
  cleanInvoiceInput,
  INVOICE_FIELDS,
  invoiceDefaults,
  validateInvoice,
} from './invoice.js';

/** @typedef {import('./validate.js').FieldError} FieldError */
/** @typedef {import('../types.ts').ImportRows} ImportRows */
/** @typedef {import('../types.ts').VarianceKind} VarianceKind */
/** @typedef {import('../types.ts').TrackedField} TrackedField */
/** @typedef {(error: FieldError) => never} Fail */
/** @typedef {Record<string, unknown>} Row */

export const EXPORT_FORMAT = 'reno-tracker/1';

const LISTS = /** @type {const} */ ([
  'schedule',
  'dependencies',
  'variances',
  'notes',
  'materials',
]);

const KINDS = ['dates', 'cost', 'scope', 'party'];

// The largest sortOrder a file row takes. A new row gets the largest
// sortOrder plus one, so a row near Number.MAX_SAFE_INTEGER would make
// every later create fail.
const MAX_SORT_ORDER = 1_000_000_000;

const SCHEDULE_FIELDS = [
  'title',
  'description',
  'startDate',
  'endDate',
  'responsibleParty',
  'estimatedCents',
  'actualCents',
  'markupBasisPoints',
];

const MATERIAL_FIELDS = [
  'name',
  'allowanceCents',
  'estimatedCents',
  'actualCents',
  'markupBasisPoints',
  'expectedDate',
];

/** @type {import('./importDocs.js').DocKind<ImportRows['invoices'][number]>} */
const INVOICES = {
  list: 'invoices',
  fields: INVOICE_FIELDS,
  validate: validateInvoice,
  defaults: (fields) => invoiceDefaults(cleanInvoiceInput(fields)),
  verb: 'bills',
};

/**
 * A change order with no rate in the file takes the project rate.
 * @param {number} projectRate
 * @returns {import('./importDocs.js').DocKind<ImportRows['changeOrders'][number]>}
 */
const changeOrderKind = (projectRate) => ({
  list: 'changeOrders',
  fields: CHANGE_ORDER_FIELDS,
  validate: validateChangeOrder,
  defaults: (fields) =>
    changeOrderDefaults(cleanChangeOrderInput(fields), projectRate),
  verb: 'adds to',
});

/**
 * @param {unknown} value
 * @returns {value is Row}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {Row} row
 * @param {string[]} keys
 * @returns {Row}
 */
function pick(row, keys) {
  /** @type {Row} */
  const out = {};
  for (const key of keys) if (key in row) out[key] = row[key];
  return out;
}

/**
 * A checked time in the UTC form that toISOString writes. Rows sort by
 * their time as text, and only this one form sorts in time order.
 * @param {string} value
 * @returns {string}
 */
const toIso = (value) => new Date(value).toISOString();

/**
 * Reads `body` as an export file.
 * @param {unknown} body
 * @param {Fail} fail throws the backend's 400 error
 * @param {string} [importedAt] the time for a note or change row with none
 * @returns {ImportRows}
 */
export function checkImport(body, fail, importedAt = new Date().toISOString()) {
  if (!isObject(body))
    return fail({ field: '', message: 'Body must be a JSON object' });
  if (body.format !== EXPORT_FORMAT) {
    fail({ field: 'format', message: `format must be "${EXPORT_FORMAT}"` });
  }
  const project = checkProject(body.project, fail);
  for (const key of LISTS) {
    if (!Array.isArray(body[key]))
      fail({ field: key, message: `${key} must be a list` });
  }
  const lists = /** @type {Record<(typeof LISTS)[number], unknown[]>} */ (
    /** @type {unknown} */ (body)
  );

  /**
   * @param {(typeof LISTS)[number]} list
   * @param {number} index
   * @param {string} message
   * @returns {never}
   */
  const bad = (list, index, message) =>
    fail({ field: list, message: `${list} row ${index + 1}: ${message}` });

  /**
   * @param {(typeof LISTS)[number]} list
   * @param {number} index
   * @param {string | null} message
   */
  const check = (list, index, message) => {
    if (message) bad(list, index, message);
  };

  /**
   * @param {(typeof LISTS)[number]} list
   * @param {unknown} row
   * @param {number} index
   * @returns {Row}
   */
  const object = (list, row, index) =>
    isObject(row)
      ? row
      : bad(list, index, `must be an object, got ${show(row)}`);

  /**
   * complete and sortOrder, with their defaults.
   * @param {(typeof LISTS)[number]} list
   * @param {Row} row
   * @param {number} index
   */
  const order = (list, row, index) => {
    const complete = row.complete ?? false;
    check(list, index, checkBoolean('complete', complete));
    const sortOrder = row.sortOrder ?? index;
    if (!Number.isSafeInteger(sortOrder)) {
      bad(
        list,
        index,
        `sortOrder must be a whole number, got ${show(sortOrder)}`,
      );
    }
    const at = /** @type {number} */ (sortOrder);
    if (at < 0 || at > MAX_SORT_ORDER) {
      bad(
        list,
        index,
        `sortOrder must be from 0 to ${MAX_SORT_ORDER}, got ${show(sortOrder)}`,
      );
    }
    return {
      complete: /** @type {boolean} */ (complete),
      sortOrder: at,
    };
  };

  /** @type {Map<string, string>} title by old id */
  const titles = new Map();
  const schedule = lists.schedule.map((raw, i) => {
    const row = object('schedule', raw, i);
    check('schedule', i, checkText('id', row.id, { min: 1, max: 100 }));
    const id = /** @type {string} */ (row.id);
    if (titles.has(id)) bad('schedule', i, `id ${show(id)} appears twice`);
    const fields = pick(row, SCHEDULE_FIELDS);
    check('schedule', i, validateScheduleItem(fields)?.message ?? null);
    const item = scheduleItemDefaults(fields);
    titles.set(id, item.title);
    return { id, ...item, ...order('schedule', row, i) };
  });

  /** @type {ImportRows['dependencies']} */
  const dependencies = [];
  /** @type {Set<string>} */
  const edgeKeys = new Set();
  /** @type {Map<string, string[]>} */
  const next = new Map();
  lists.dependencies.forEach((raw, i) => {
    const row = object('dependencies', raw, i);
    const edge = {
      predecessorId: /** @type {string} */ (row.predecessorId),
      successorId: /** @type {string} */ (row.successorId),
    };
    if (!titles.has(edge.predecessorId) || !titles.has(edge.successorId))
      return;
    const key = JSON.stringify([edge.predecessorId, edge.successorId]);
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    const loop = findCycleIn(next, edge);
    if (loop) {
      const names = loop.map((id) => titles.get(id)).join(' -> ');
      bad('dependencies', i, `makes a loop: ${names}`);
    }
    dependencies.push(edge);
    addEdge(next, edge);
  });

  /** @type {ImportRows['variances']} */
  const variances = [];
  lists.variances.forEach((raw, i) => {
    const row = object('variances', raw, i);
    const scheduleItemId = /** @type {string} */ (row.scheduleItemId);
    if (!titles.has(scheduleItemId)) return;
    if (!KINDS.includes(/** @type {string} */ (row.kind))) {
      bad(
        'variances',
        i,
        `kind must be one of ${KINDS.join(', ')}, got ${show(row.kind)}`,
      );
    }
    if (!Object.hasOwn(TRACKED_FIELDS, /** @type {string} */ (row.field))) {
      bad(
        'variances',
        i,
        `field must name a tracked field, got ${show(row.field)}`,
      );
    }
    const kind = TRACKED_FIELDS[/** @type {TrackedField} */ (row.field)];
    if (row.kind !== kind) {
      bad(
        'variances',
        i,
        `kind of ${row.field} must be ${kind}, got ${show(row.kind)}`,
      );
    }
    const oldValue = row.oldValue ?? null;
    const newValue = row.newValue ?? null;
    for (const [name, value] of [
      ['oldValue', oldValue],
      ['newValue', newValue],
    ]) {
      if (value !== null)
        check('variances', i, checkText(/** @type {string} */ (name), value));
    }
    const reason = row.reason ?? '';
    check('variances', i, checkText('reason', reason, { max: 500 }));
    const loggedAt = row.loggedAt ?? importedAt;
    check('variances', i, checkTimestamp('loggedAt', loggedAt));
    variances.push({
      scheduleItemId,
      kind: /** @type {VarianceKind} */ (row.kind),
      field: /** @type {TrackedField} */ (row.field),
      oldValue: /** @type {string | null} */ (oldValue),
      newValue: /** @type {string | null} */ (newValue),
      reason: /** @type {string} */ (reason),
      loggedAt: toIso(/** @type {string} */ (loggedAt)),
    });
  });

  /** @type {ImportRows['notes']} */
  const notes = [];
  lists.notes.forEach((raw, i) => {
    const row = object('notes', raw, i);
    const scheduleItemId = /** @type {string} */ (row.scheduleItemId);
    if (!titles.has(scheduleItemId)) return;
    check('notes', i, checkText('body', row.body, { min: 1, max: 5000 }));
    const createdAt = row.createdAt ?? importedAt;
    check('notes', i, checkTimestamp('createdAt', createdAt));
    const updatedAt = row.updatedAt ?? createdAt;
    check('notes', i, checkTimestamp('updatedAt', updatedAt));
    notes.push({
      scheduleItemId,
      body: /** @type {string} */ (row.body),
      createdAt: toIso(/** @type {string} */ (createdAt)),
      updatedAt: toIso(/** @type {string} */ (updatedAt)),
    });
  });

  /** @type {Set<string>} */
  const materialIds = new Set();
  const materials = lists.materials.map((raw, i) => {
    const row = object('materials', raw, i);
    const id = row.id ?? null;
    if (id !== null) {
      check('materials', i, checkText('id', id, { min: 1, max: 100 }));
      if (materialIds.has(/** @type {string} */ (id))) {
        bad('materials', i, `id ${show(id)} appears twice`);
      }
      materialIds.add(/** @type {string} */ (id));
    }
    const link = /** @type {string} */ (row.scheduleItemId);
    const fields = {
      ...pick(row, MATERIAL_FIELDS),
      scheduleItemId: titles.has(link) ? link : null,
    };
    check('materials', i, validateMaterialItem(fields)?.message ?? null);
    return {
      id: /** @type {string | null} */ (id),
      ...materialItemDefaults(fields),
      ...order('materials', row, i),
    };
  });

  const known = { items: new Set(titles.keys()), materials: materialIds };
  const invoices = checkDocs(INVOICES, body.invoices, known, fail);
  const changeOrders = checkDocs(
    changeOrderKind(project.markupBasisPoints),
    body.changeOrders,
    known,
    fail,
  );

  return {
    project,
    schedule,
    dependencies,
    variances,
    notes,
    materials,
    invoices,
    changeOrders,
  };
}

/**
 * @param {unknown} raw
 * @param {Fail} fail
 * @returns {ImportRows['project']}
 */
function checkProject(raw, fail) {
  if (!isObject(raw)) {
    return fail({
      field: 'project',
      message: `project must be an object, got ${show(raw)}`,
    });
  }
  const fields = pick(raw, [...PROJECT_FIELDS]);
  const error = validateProject(fields);
  if (error) fail({ field: 'project', message: `project: ${error.message}` });
  return projectDefaults(fields);
}
