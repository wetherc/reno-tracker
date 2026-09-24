// A good export file, and the bad files that both backends refuse with
// the same 400.

export const AT = '2026-01-05T10:00:00.000Z';

/** @param {Record<string, unknown>} [changes] */
export function file(changes = {}) {
  return {
    format: 'reno-tracker/1',
    exportedAt: AT,
    project: { name: 'Bath', startDate: '2026-01-05', budgetCents: 500 },
    schedule: [
      {
        id: 'a',
        title: 'Demo',
        startDate: '2026-01-05',
        endDate: '2026-01-06',
      },
      {
        id: 'b',
        title: 'Tile',
        startDate: '2026-01-07',
        endDate: '2026-01-09',
      },
    ],
    dependencies: [],
    variances: [],
    notes: [],
    materials: [],
    ...changes,
  };
}

/** @type {[string, unknown, string, string?][]} */
export const REFUSED = [
  ['a list body', [], 'Body must be a JSON object'],
  [
    'another format',
    { format: 'other' },
    'format must be "reno-tracker/1"',
    'format',
  ],
  [
    'no project',
    file({ project: undefined }),
    'project must be an object, got undefined',
    'project',
  ],
  [
    'a project start that is not a date',
    file({ project: { name: 'Bath', startDate: 'nope' } }),
    'project: startDate must be a date like 2026-03-14, got "nope"',
    'project',
  ],
  [
    'a fractional negative budget',
    file({
      project: { name: 'Bath', startDate: '2026-01-05', budgetCents: -5.5 },
    }),
    'project: budgetCents must be whole cents, zero or more, got -5.5',
    'project',
  ],
  [
    'a budget above the limit',
    file({
      project: { name: 'Bath', startDate: '2026-01-05', budgetCents: 1e14 },
    }),
    'project: budgetCents must be at most 100000000000 cents, got 100000000000000',
    'project',
  ],
  [
    'a missing list',
    file({ notes: undefined }),
    'notes must be a list',
    'notes',
  ],
  [
    'a schedule row that is not an object',
    file({ schedule: ['x'] }),
    'schedule row 1: must be an object, got "x"',
    'schedule',
  ],
  [
    'a schedule row with no id',
    file({
      schedule: [
        { title: 'Demo', startDate: '2026-01-05', endDate: '2026-01-05' },
      ],
    }),
    'schedule row 1: id must be text, got undefined',
    'schedule',
  ],
  [
    'a repeated id',
    file({
      schedule: [
        ...file().schedule,
        {
          id: 'a',
          title: 'Again',
          startDate: '2026-01-05',
          endDate: '2026-01-05',
        },
      ],
    }),
    'schedule row 3: id "a" appears twice',
    'schedule',
  ],
  [
    'an item with no title',
    file({
      schedule: [{ id: 'a', startDate: '2026-01-05', endDate: '2026-01-05' }],
    }),
    'schedule row 1: title must be text, got undefined',
    'schedule',
  ],
  [
    'a day that is not on the calendar',
    file({
      schedule: [
        {
          id: 'a',
          title: 'Demo',
          startDate: '2026-02-30',
          endDate: '2026-03-02',
        },
      ],
    }),
    'schedule row 1: startDate must be a date like 2026-03-14, got "2026-02-30"',
    'schedule',
  ],
  [
    'a year past the last date',
    file({
      schedule: [
        {
          id: 'a',
          title: 'Demo',
          startDate: '2026-01-05',
          endDate: '9999-12-31',
        },
      ],
    }),
    'schedule row 1: endDate must be from 1900-01-01 to 2200-12-31, got "9999-12-31"',
    'schedule',
  ],
  [
    'an end before the start',
    file({
      schedule: [
        {
          id: 'a',
          title: 'Demo',
          startDate: '2026-01-09',
          endDate: '2026-01-05',
        },
      ],
    }),
    'schedule row 1: endDate 2026-01-05 is before startDate 2026-01-09',
    'schedule',
  ],
  [
    'an estimate written as text',
    file({
      schedule: [
        {
          id: 'a',
          title: 'Demo',
          startDate: '2026-01-05',
          endDate: '2026-01-05',
          estimatedCents: '12.5',
        },
      ],
    }),
    'schedule row 1: estimatedCents must be whole cents, zero or more, got "12.5"',
    'schedule',
  ],
  [
    'a complete flag that is a number',
    file({
      schedule: [
        {
          id: 'a',
          title: 'Demo',
          startDate: '2026-01-05',
          endDate: '2026-01-05',
          complete: 1,
        },
      ],
    }),
    'schedule row 1: complete must be true or false, got 1',
    'schedule',
  ],
  [
    'a fractional sort order',
    file({ materials: [{ name: 'Grout', sortOrder: 1.5 }] }),
    'materials row 1: sortOrder must be a whole number, got 1.5',
    'materials',
  ],
  [
    'a dependency row that is not an object',
    file({ dependencies: [null] }),
    'dependencies row 1: must be an object, got null',
    'dependencies',
  ],
  [
    'an item that waits on itself',
    file({ dependencies: [{ predecessorId: 'a', successorId: 'a' }] }),
    'dependencies row 1: makes a loop: Demo -> Demo',
    'dependencies',
  ],
  [
    'a loop of two items',
    file({
      dependencies: [
        { predecessorId: 'a', successorId: 'b' },
        { predecessorId: 'b', successorId: 'a' },
      ],
    }),
    'dependencies row 2: makes a loop: Demo -> Tile -> Demo',
    'dependencies',
  ],
  [
    'an unknown change kind',
    file({
      variances: [{ scheduleItemId: 'a', kind: 'mood', field: 'title' }],
    }),
    'variances row 1: kind must be one of dates, cost, scope, party, got "mood"',
    'variances',
  ],
  [
    'an unknown change field',
    file({
      variances: [{ scheduleItemId: 'a', kind: 'scope', field: 'colour' }],
    }),
    'variances row 1: field must name a tracked field, got "colour"',
    'variances',
  ],
  [
    'a change value that is a number',
    file({
      variances: [
        {
          scheduleItemId: 'a',
          kind: 'cost',
          field: 'estimatedCents',
          newValue: 5,
        },
      ],
    }),
    'variances row 1: newValue must be text, got 5',
    'variances',
  ],
  [
    'a long change reason',
    file({
      variances: [
        {
          scheduleItemId: 'a',
          kind: 'scope',
          field: 'title',
          reason: 'x'.repeat(501),
        },
      ],
    }),
    'variances row 1: reason is over 500 characters',
    'variances',
  ],
  [
    'a change time that is not a time',
    file({
      variances: [
        { scheduleItemId: 'a', kind: 'scope', field: 'title', loggedAt: 'now' },
      ],
    }),
    'variances row 1: loggedAt must be a time like 2026-03-14T09:30:00.000Z, got "now"',
    'variances',
  ],
  [
    'a blank note',
    file({ notes: [{ scheduleItemId: 'a', body: ' ' }] }),
    'notes row 1: body cannot be blank',
    'notes',
  ],
  [
    'a note edit time that is not a time',
    file({
      notes: [
        { scheduleItemId: 'a', body: 'Hi', updatedAt: '2026-13-01T00:00:00Z' },
      ],
    }),
    'notes row 1: updatedAt must be a time like 2026-03-14T09:30:00.000Z, got "2026-13-01T00:00:00Z"',
    'notes',
  ],
  [
    'a material with no name',
    file({ materials: [{ allowanceCents: 5 }] }),
    'materials row 1: name must be text, got undefined',
    'materials',
  ],
  [
    'a material day that is not a date',
    file({ materials: [{ name: 'Grout', expectedDate: 'soon' }] }),
    'materials row 1: expectedDate must be a date like 2026-03-14, got "soon"',
    'materials',
  ],
  [
    'a material id that is not text',
    file({ materials: [{ id: 5, name: 'Grout' }] }),
    'materials row 1: id must be text, got 5',
    'materials',
  ],
  [
    'two materials with one id',
    file({
      materials: [
        { id: 'm', name: 'Grout' },
        { id: 'm', name: 'Tile' },
      ],
    }),
    'materials row 2: id "m" appears twice',
    'materials',
  ],
  [
    'invoices that are not a list',
    file({ invoices: {} }),
    'invoices must be a list',
    'invoices',
  ],
  [
    'an invoice that is not an object',
    file({ invoices: [7] }),
    'invoices row 1: must be an object, got 7',
    'invoices',
  ],
  [
    'an invoice with no lines',
    file({ invoices: [{ party: 'P', issuedDate: '2026-01-05', lines: [] }] }),
    'invoices row 1: lines must list at least one line',
    'invoices',
  ],
  [
    'an invoice line for an item the file does not list',
    file({
      invoices: [
        {
          party: 'P',
          issuedDate: '2026-01-05',
          lines: [
            { scheduleItemId: 'a', amountCents: 1 },
            { scheduleItemId: 'zz', amountCents: 1 },
          ],
        },
      ],
    }),
    'invoices row 1: line 2 bills schedule item "zz", which the file does not list',
    'invoices',
  ],
  [
    'an invoice line for a material the file does not list',
    file({
      materials: [{ name: 'Grout' }],
      invoices: [
        {
          party: 'P',
          issuedDate: '2026-01-05',
          lines: [{ materialItemId: 'm', amountCents: 1 }],
        },
      ],
    }),
    'invoices row 1: line 1 bills material "m", which the file does not list',
    'invoices',
  ],
];
