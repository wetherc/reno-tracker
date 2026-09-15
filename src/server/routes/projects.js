import { projectDefaults, validateProject } from '../../entities/project.js';
import {
  createProject,
  deleteProject,
  getProjectPayload,
  listProjects,
  patchProject,
} from '../repo/projects.js';
import { reorderSchedule } from '../repo/schedule.js';
import { reorderMaterials } from '../repo/materials.js';
import { badRequest } from '../errors.js';
import { asObject, pick, rejectInvalid } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */

const FIELDS = /** @type {const} */ (['name', 'budgetCents', 'startDate']);

/**
 * @param {Router} router
 * @param {Database} db
 */
export function projectRoutes(router, db) {
  router.get('/api/projects', () => listProjects(db));

  router.post('/api/projects', ({ body }) => {
    const input = pick(asObject(body), FIELDS);
    rejectInvalid(validateProject(input));
    return createProject(
      db,
      projectDefaults(
        /** @type {import('../../types.ts').ProjectInput} */ (input),
      ),
    );
  });

  router.get('/api/projects/:id', ({ params }) =>
    getProjectPayload(db, params.id),
  );

  router.patch('/api/projects/:id', ({ params, body }) => {
    const input = pick(asObject(body), FIELDS);
    rejectInvalid(validateProject(input, { partial: true }));
    return patchProject(
      db,
      params.id,
      /** @type {import('../../types.ts').ProjectInput} */ (input),
    );
  });

  router.delete('/api/projects/:id', ({ params }) => {
    deleteProject(db, params.id);
  });

  router.post('/api/projects/:id/reorder', ({ params, body }) => {
    const input = asObject(body);
    if (
      !Array.isArray(input.ids) ||
      !input.ids.every((id) => typeof id === 'string')
    ) {
      throw badRequest('ids must be a list of ids', 'ids');
    }
    const ids = /** @type {string[]} */ (input.ids);
    if (input.kind === 'schedule') reorderSchedule(db, params.id, ids);
    else if (input.kind === 'materials') reorderMaterials(db, params.id, ids);
    else throw badRequest('kind must be "schedule" or "materials"', 'kind');
    return getProjectPayload(db, params.id);
  });
}
