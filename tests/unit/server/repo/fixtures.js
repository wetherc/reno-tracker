// Shared helpers for repository tests. Every test gets a fresh in-memory
// database with one project.
import { openDatabase } from '../../../../src/server/db/open.js';
import { createProject } from '../../../../src/server/repo/projects.js';
import { createScheduleItem } from '../../../../src/server/repo/schedule.js';
import { scheduleItemDefaults } from '../../../../src/entities/scheduleItem.js';

export function freshDb() {
  const db = openDatabase(':memory:');
  const project = createProject(db, {
    name: 'Kitchen',
    budgetCents: 5_000_000,
    startDate: '2026-01-05',
  });
  return { db, project };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} projectId
 * @param {string} title
 * @param {import('../../../../src/types.ts').ScheduleItemInput} [extra]
 */
export function addItem(db, projectId, title, extra = {}) {
  return createScheduleItem(
    db,
    projectId,
    scheduleItemDefaults({
      title,
      startDate: '2026-01-05',
      endDate: '2026-01-09',
      ...extra,
    }),
  );
}

export const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
