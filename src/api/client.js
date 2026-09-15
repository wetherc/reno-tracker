// One function per route. Every call resolves to the parsed JSON body or
// rejects with an ApiError that keeps the status and the server message.
import { ApiError } from './errors.js';

/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ScheduleItemInput} ScheduleItemInput */
/** @typedef {import('../types.ts').ScheduleItemPatch} ScheduleItemPatch */
/** @typedef {import('../types.ts').Note} Note */
/** @typedef {import('../types.ts').Dependency} Dependency */
/** @typedef {import('../types.ts').DependencyInput} DependencyInput */
/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').MaterialItemInput} MaterialItemInput */
/** @typedef {import('../types.ts').ReorderKind} ReorderKind */
/** @typedef {import('../types.ts').ExportFile} ExportFile */

/** @typedef {ReturnType<typeof createApi>} Api */

/**
 * @param {{ fetch?: typeof fetch, base?: string }} [options]
 */
export function createApi({
  fetch: fetchFn = globalThis.fetch,
  base = '',
} = {}) {
  /**
   * @template T
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @returns {Promise<T>}
   */
  async function request(method, path, body) {
    const res = await fetchFn(base + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return /** @type {T} */ (undefined);
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const errorBody =
        parsed && typeof parsed.error === 'string'
          ? parsed
          : { error: `The server answered ${res.status}` };
      throw new ApiError(res.status, errorBody);
    }
    return /** @type {T} */ (parsed);
  }

  return {
    /** @returns {Promise<Project[]>} */
    listProjects: () => request('GET', '/api/projects'),
    /** @param {ProjectInput} input @returns {Promise<Project>} */
    createProject: (input) => request('POST', '/api/projects', input),
    /** @param {string} id @returns {Promise<ProjectPayload>} */
    getProject: (id) => request('GET', `/api/projects/${id}`),
    /** @param {string} id @param {ProjectInput} input @returns {Promise<Project>} */
    patchProject: (id, input) => request('PATCH', `/api/projects/${id}`, input),
    /** @param {string} id @returns {Promise<void>} */
    deleteProject: (id) => request('DELETE', `/api/projects/${id}`),

    /** @param {string} projectId @param {ScheduleItemInput} input @returns {Promise<ScheduleItem>} */
    createScheduleItem: (projectId, input) =>
      request('POST', `/api/projects/${projectId}/schedule`, input),
    /** @param {string} id @param {ScheduleItemPatch} patch @returns {Promise<ScheduleItem>} */
    patchScheduleItem: (id, patch) =>
      request('PATCH', `/api/schedule/${id}`, patch),
    /** @param {string} id @returns {Promise<void>} */
    deleteScheduleItem: (id) => request('DELETE', `/api/schedule/${id}`),
    /** @param {string} id @param {boolean} complete @returns {Promise<ScheduleItem>} */
    setScheduleComplete: (id, complete) =>
      request('POST', `/api/schedule/${id}/complete`, { complete }),

    /** @param {string} itemId @param {string} body @returns {Promise<Note>} */
    addNote: (itemId, body) =>
      request('POST', `/api/schedule/${itemId}/notes`, { body }),
    /** @param {string} id @param {string} body @returns {Promise<Note>} */
    patchNote: (id, body) => request('PATCH', `/api/notes/${id}`, { body }),
    /** @param {string} id @returns {Promise<void>} */
    deleteNote: (id) => request('DELETE', `/api/notes/${id}`),

    /** @param {string} projectId @param {DependencyInput} input @returns {Promise<Dependency>} */
    addDependency: (projectId, input) =>
      request('POST', `/api/projects/${projectId}/dependencies`, input),
    /** @param {string} id @returns {Promise<void>} */
    deleteDependency: (id) => request('DELETE', `/api/dependencies/${id}`),

    /** @param {string} projectId @param {MaterialItemInput} input @returns {Promise<MaterialItem>} */
    createMaterial: (projectId, input) =>
      request('POST', `/api/projects/${projectId}/materials`, input),
    /** @param {string} id @param {MaterialItemInput} input @returns {Promise<MaterialItem>} */
    patchMaterial: (id, input) =>
      request('PATCH', `/api/materials/${id}`, input),
    /** @param {string} id @returns {Promise<void>} */
    deleteMaterial: (id) => request('DELETE', `/api/materials/${id}`),
    /** @param {string} id @param {boolean} complete @returns {Promise<MaterialItem>} */
    setMaterialComplete: (id, complete) =>
      request('POST', `/api/materials/${id}/complete`, { complete }),

    /** @param {string} projectId @param {ReorderKind} kind @param {string[]} ids @returns {Promise<ProjectPayload>} */
    reorder: (projectId, kind, ids) =>
      request('POST', `/api/projects/${projectId}/reorder`, { kind, ids }),

    /** @param {string} id @returns {Promise<ExportFile>} */
    exportProject: (id) => request('GET', `/api/projects/${id}/export`),
    /** @param {ExportFile} file @returns {Promise<ProjectPayload>} */
    importProject: (file) => request('POST', '/api/projects/import', file),
  };
}
