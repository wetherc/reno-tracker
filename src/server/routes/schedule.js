import {
  scheduleItemDefaults,
  validateScheduleItem,
} from '../../entities/scheduleItem.js';
import {
  createScheduleItem,
  deleteScheduleItem,
  getScheduleItem,
  patchScheduleItem,
  setScheduleItemComplete,
} from '../repo/schedule.js';
import { checkText } from '../../entities/validate.js';
import { asObject, pick, readComplete, rejectInvalid } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */
/** @typedef {import('../../types.ts').ScheduleItemInput} ScheduleItemInput */

const FIELDS = /** @type {const} */ ([
  'title',
  'description',
  'startDate',
  'endDate',
  'responsibleParty',
  'estimatedCents',
  'actualCents',
]);

/**
 * @param {Router} router
 * @param {Database} db
 */
export function scheduleRoutes(router, db) {
  router.post('/api/projects/:id/schedule', ({ params, body }) => {
    const input = pick(asObject(body), FIELDS);
    rejectInvalid(validateScheduleItem(input));
    return createScheduleItem(
      db,
      params.id,
      scheduleItemDefaults(/** @type {ScheduleItemInput} */ (input)),
    );
  });

  router.patch('/api/schedule/:id', ({ params, body }) => {
    const raw = asObject(body);
    const current = getScheduleItem(db, params.id);
    const input = pick(raw, FIELDS);
    rejectInvalid(validateScheduleItem(input, { partial: true, current }));
    const reason = raw.reason ?? '';
    const reasonError = checkText('reason', reason, { max: 500 });
    rejectInvalid(
      reasonError ? { field: 'reason', message: reasonError } : null,
    );
    return patchScheduleItem(
      db,
      params.id,
      /** @type {ScheduleItemInput} */ (input),
      /** @type {string} */ (reason),
    );
  });

  router.delete('/api/schedule/:id', ({ params }) => {
    deleteScheduleItem(db, params.id);
  });

  router.post('/api/schedule/:id/complete', ({ params, body }) =>
    setScheduleItemComplete(db, params.id, readComplete(body)),
  );
}
