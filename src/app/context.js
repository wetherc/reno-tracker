// The one object every wiring module receives. It keeps the project list
// and the open project payload, tells listeners when either changes, and
// runs every write through one path that refetches and reports.
import { describeFailure } from '../api/errors.js';

/** @typedef {import('../api/client.js').Api} Api */
/** @typedef {import('../storage/prefs.js').Prefs} Prefs */
/** @typedef {import('../ui/Toast.js').Toaster} Toaster */
/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @typedef {{ projects: Project[], payload: ProjectPayload | null }} Events
 */

/**
 * @template T
 * @typedef {{ ok: true, result: T } | { ok: false, error: unknown }} WriteOutcome
 */

/** @typedef {ReturnType<typeof createContext>} AppContext */

/**
 * @param {{ api: Api, prefs: Prefs, toaster: Toaster }} deps
 */
export function createContext({ api, prefs, toaster }) {
  /** @type {Project[]} */
  let projects = [];
  /** @type {ProjectPayload | null} */
  let payload = null;
  /** @type {{ [K in keyof Events]: Set<(value: Events[K]) => void> }} */
  const listeners = { projects: new Set(), payload: new Set() };

  /**
   * @template {keyof Events} K
   * @param {K} event
   * @param {Events[K]} value
   */
  function emit(event, value) {
    for (const fn of listeners[event]) fn(value);
  }

  return {
    api,
    prefs,
    toaster,
    get projects() {
      return projects;
    },
    get payload() {
      return payload;
    },

    /**
     * @template {keyof Events} K
     * @param {K} event
     * @param {(value: Events[K]) => void} fn
     * @returns {() => void} unsubscribe
     */
    on(event, fn) {
      listeners[event].add(fn);
      return () => listeners[event].delete(fn);
    },

    async loadProjects() {
      projects = await api.listProjects();
      emit('projects', projects);
      return projects;
    },

    /** @param {string} id */
    async openProject(id) {
      payload = await api.getProject(id);
      prefs.write('lastProject', id);
      emit('payload', payload);
      return payload;
    },

    closeProject() {
      payload = null;
      prefs.clear('lastProject');
      emit('payload', null);
    },

    /** Refetches the open project so the screen matches the database. */
    async refresh() {
      if (payload) await this.openProject(payload.project.id);
    },

    /**
     * Runs one write. On success the open project is refetched and the
     * done message, if any, is toasted. On failure the message is toasted
     * and the error comes back so a form can mark the field.
     * @template T
     * @param {(api: Api) => Promise<T>} work
     * @param {{ done?: string, reload?: boolean }} [options] reload also refetches the project list
     * @returns {Promise<WriteOutcome<T>>}
     */
    async write(work, { done, reload = false } = {}) {
      try {
        const result = await work(api);
        if (reload) await this.loadProjects();
        await this.refresh();
        if (done) toaster.success(done);
        return { ok: true, result };
      } catch (error) {
        toaster.failure(describeFailure(error));
        return { ok: false, error };
      }
    },
  };
}
