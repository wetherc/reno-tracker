// A fake api and context for schedule tests. The api keeps items, notes,
// and variances in memory and writes one variance row per changed
// tracked field, the way the server does.
import { createContext } from '../../../src/app/context.js';
import { diffTrackedFields } from '../../../src/entities/variance.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';

/** @typedef {import('../../../src/types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../../../src/types.ts').Note} Note */
/** @typedef {import('../../../src/types.ts').Variance} Variance */

/**
 * @param {string} id
 * @param {Partial<ScheduleItem>} [extra]
 * @returns {ScheduleItem}
 */
export function itemOf(id, extra = {}) {
  return {
    id,
    projectId: 'p1',
    title: `Item ${id}`,
    description: '',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    responsibleParty: '',
    estimatedCents: 10000,
    actualCents: null,
    complete: false,
    sortOrder: 0,
    ...extra,
  };
}

/**
 * @param {{ schedule?: ScheduleItem[], notes?: Note[], variances?: Variance[] }} [seed]
 */
export function setupSchedule({
  schedule = [],
  notes = [],
  variances = [],
} = {}) {
  let items = schedule;
  let allNotes = notes;
  let allVariances = variances;
  /** @type {string[]} */
  const log = [];
  /** @type {string[]} */
  const toasts = [];
  let counter = 0;
  const stamp = () => `2026-09-15T12:00:${String(++counter).padStart(2, '0')}Z`;

  const api = /** @type {any} */ ({
    listProjects: async () => [project],
    getProject: async () => ({
      project,
      schedule: items,
      dependencies: [],
      variances: allVariances,
      notes: allNotes,
      materials: [],
    }),
    createScheduleItem: async (
      /** @type {string} */ projectId,
      /** @type {any} */ input,
    ) => {
      if (input.title === 'boom') throw new Error('boom');
      const created = itemOf(`n${items.length + 1}`, { ...input, projectId });
      items = [...items, created];
      log.push(`create ${input.title}`);
      return created;
    },
    patchScheduleItem: async (
      /** @type {string} */ id,
      /** @type {any} */ patch,
    ) => {
      const before = items.find((i) => i.id === id);
      if (!before) throw new Error(`no item ${id}`);
      const { reason = '', ...fields } = patch;
      for (const diff of diffTrackedFields(before, fields)) {
        allVariances = [
          ...allVariances,
          {
            ...diff,
            id: `v${allVariances.length + 1}`,
            scheduleItemId: id,
            reason,
            loggedAt: stamp(),
          },
        ];
      }
      items = items.map((i) => (i.id === id ? { ...i, ...fields } : i));
      log.push(`patch ${id} ${reason}`);
      return items.find((i) => i.id === id);
    },
    deleteScheduleItem: async (/** @type {string} */ id) => {
      items = items.filter((i) => i.id !== id);
      allNotes = allNotes.filter((n) => n.scheduleItemId !== id);
      log.push(`delete ${id}`);
    },
    setScheduleComplete: async (
      /** @type {string} */ id,
      /** @type {boolean} */ complete,
    ) => {
      if (id === 'stuck') throw new Error('stuck');
      items = items.map((i) => (i.id === id ? { ...i, complete } : i));
      log.push(`complete ${id} ${complete}`);
    },
    addNote: async (
      /** @type {string} */ itemId,
      /** @type {string} */ body,
    ) => {
      const at = stamp();
      allNotes = [
        ...allNotes,
        {
          id: `note${allNotes.length + 1}`,
          scheduleItemId: itemId,
          body,
          createdAt: at,
          updatedAt: at,
        },
      ];
      log.push(`note ${itemId} ${body}`);
    },
    patchNote: async (/** @type {string} */ id, /** @type {string} */ body) => {
      allNotes = allNotes.map((n) =>
        n.id === id ? { ...n, body, updatedAt: stamp() } : n,
      );
      log.push(`edit ${id} ${body}`);
    },
    deleteNote: async (/** @type {string} */ id) => {
      allNotes = allNotes.filter((n) => n.id !== id);
      log.push(`unnote ${id}`);
    },
  });
  const project = {
    id: 'p1',
    name: 'Kitchen',
    budgetCents: 5000000,
    startDate: '2026-09-01',
    createdAt: '',
  };
  const toaster = /** @type {any} */ ({
    success: (/** @type {string} */ m) => toasts.push(`ok ${m}`),
    failure: (/** @type {string} */ m) => toasts.push(`bad ${m}`),
  });
  const ctx = createContext({
    api,
    prefs: createPrefs(memoryStorage()),
    toaster,
  });
  return { ctx, log, toasts, items: () => items, notes: () => allNotes };
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
