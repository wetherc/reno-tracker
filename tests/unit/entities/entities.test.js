import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectDefaults,
  validateProject,
} from '../../../src/entities/project.js';
import {
  scheduleItemDefaults,
  validateScheduleItem,
  TRACKED_FIELDS,
} from '../../../src/entities/scheduleItem.js';
import {
  materialItemDefaults,
  validateMaterialItem,
} from '../../../src/entities/materialItem.js';
import { diffTrackedFields, toStored } from '../../../src/entities/variance.js';

test('project defaults and validation', () => {
  assert.deepEqual(projectDefaults({ name: 'Kitchen' }), {
    name: 'Kitchen',
    budgetCents: 0,
    startDate: '',
  });
  assert.equal(
    validateProject({ name: 'Kitchen', startDate: '2026-01-05' }),
    null,
  );
  assert.deepEqual(validateProject({ name: 'Kitchen' }), {
    field: 'startDate',
    message: 'startDate must be a date like 2026-03-14, got undefined',
  });
  assert.equal(validateProject({ budgetCents: 5 }, { partial: true }), null);
  assert.equal(validateProject({ name: '' }, { partial: true })?.field, 'name');
});

test('schedule item defaults fill endDate from startDate', () => {
  assert.deepEqual(
    scheduleItemDefaults({ title: 'Demo', startDate: '2026-01-05' }),
    {
      title: 'Demo',
      description: '',
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      responsibleParty: '',
      estimatedCents: 0,
      actualCents: null,
    },
  );
});

test('schedule item validation checks the date order', () => {
  const ok = { title: 'Demo', startDate: '2026-01-05', endDate: '2026-01-07' };
  assert.equal(validateScheduleItem(ok), null);
  assert.deepEqual(validateScheduleItem({ ...ok, endDate: '2026-01-04' }), {
    field: 'endDate',
    message: 'endDate 2026-01-04 is before startDate 2026-01-05',
  });
  assert.equal(validateScheduleItem({}, { partial: true }), null);
  assert.equal(
    validateScheduleItem(
      { startDate: '2026-02-01' },
      { partial: true, current: ok },
    )?.field,
    'endDate',
  );
  assert.equal(
    validateScheduleItem(
      { endDate: '2026-02-01' },
      { partial: true, current: ok },
    ),
    null,
  );
  assert.equal(validateScheduleItem({ ...ok, actualCents: null }), null);
  assert.equal(
    validateScheduleItem({ ...ok, actualCents: -1 })?.field,
    'actualCents',
  );
  assert.equal(
    validateScheduleItem({ startDate: '2026-01-05' })?.field,
    'title',
  );
});

test('material item defaults and validation', () => {
  assert.deepEqual(materialItemDefaults({ name: 'Tile' }), {
    name: 'Tile',
    scheduleItemId: null,
    allowanceCents: 0,
    estimatedCents: 0,
    actualCents: null,
    expectedDate: null,
  });
  assert.equal(validateMaterialItem({ name: 'Tile' }), null);
  assert.equal(validateMaterialItem({})?.field, 'name');
  assert.equal(
    validateMaterialItem({ expectedDate: null }, { partial: true }),
    null,
  );
  assert.equal(
    validateMaterialItem({ expectedDate: 'soon' }, { partial: true })?.field,
    'expectedDate',
  );
  assert.equal(
    validateMaterialItem({ scheduleItemId: '' }, { partial: true })?.field,
    'scheduleItemId',
  );
});

test('toStored keeps null and stringifies the rest', () => {
  assert.equal(toStored(null), null);
  assert.equal(toStored(undefined), null);
  assert.equal(toStored(1200), '1200');
  assert.equal(toStored('x'), 'x');
});

test('diffTrackedFields emits one row per changed tracked field, in field order', () => {
  /** @type {import('../../../src/types.ts').ScheduleItem} */
  const before = {
    id: 'i',
    projectId: 'p',
    title: 'Demo',
    description: '',
    startDate: '2026-01-05',
    endDate: '2026-01-07',
    responsibleParty: 'Crew',
    estimatedCents: 1000,
    actualCents: null,
    complete: false,
    sortOrder: 0,
  };
  const rows = diffTrackedFields(before, {
    endDate: '2026-01-09',
    title: 'Demo',
    actualCents: 1200,
    complete: true,
    responsibleParty: 'Other',
  });
  assert.deepEqual(rows, [
    {
      kind: 'dates',
      field: 'endDate',
      oldValue: '2026-01-07',
      newValue: '2026-01-09',
    },
    {
      kind: 'party',
      field: 'responsibleParty',
      oldValue: 'Crew',
      newValue: 'Other',
    },
    { kind: 'cost', field: 'actualCents', oldValue: null, newValue: '1200' },
  ]);
  assert.deepEqual(Object.keys(TRACKED_FIELDS).length, 7);
});

test('defaults keep every field the caller gives', () => {
  assert.deepEqual(
    projectDefaults({ name: 'Bath', budgetCents: 5, startDate: '2026-02-01' }),
    { name: 'Bath', budgetCents: 5, startDate: '2026-02-01' },
  );
  const item = {
    title: 'Tile',
    description: 'Floor',
    startDate: '2026-02-01',
    endDate: '2026-02-03',
    responsibleParty: 'Us',
    estimatedCents: 100,
    actualCents: 90,
  };
  assert.deepEqual(scheduleItemDefaults(item), item);
  const material = {
    name: 'Grout',
    scheduleItemId: 'i',
    allowanceCents: 10,
    estimatedCents: 12,
    actualCents: 11,
    expectedDate: '2026-02-02',
  };
  assert.deepEqual(materialItemDefaults(material), material);
});

test('defaults fill an empty body and keep an explicit null', () => {
  assert.deepEqual(projectDefaults({}), {
    name: '',
    budgetCents: 0,
    startDate: '',
  });
  assert.deepEqual(scheduleItemDefaults({}), {
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    responsibleParty: '',
    estimatedCents: 0,
    actualCents: null,
  });
  assert.deepEqual(
    materialItemDefaults({
      scheduleItemId: null,
      actualCents: null,
      expectedDate: null,
    }),
    {
      name: '',
      scheduleItemId: null,
      allowanceCents: 0,
      estimatedCents: 0,
      actualCents: null,
      expectedDate: null,
    },
  );
});
