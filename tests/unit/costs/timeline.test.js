import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  byWeek,
  costEvents,
  cumulative,
  invoiceEvents,
  landingDate,
  materialExpected,
} from '../../../src/costs/timeline.js';
import {
  changeOrderOf,
  invoiceOf,
  itemOf,
  lineOf,
  materialOf,
} from '../app/scheduleFixtures.js';

const payload = /** @type {any} */ ({
  project: {
    startDate: '2026-09-01',
    budgetCents: 100000,
    markupBasisPoints: 0,
  },
  invoices: [],
  changeOrders: [],
  schedule: [
    itemOf('b', {
      endDate: '2026-10-20',
      estimatedCents: 30000,
      actualCents: 4000,
    }),
    itemOf('a', {
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      estimatedCents: 10000,
      actualCents: 12000,
      complete: true,
    }),
  ],
  materials: [
    materialOf('m1', {
      expectedDate: '2026-12-02',
      estimatedCents: 5000,
      actualCents: 800,
    }),
    materialOf('m2', {
      scheduleItemId: 'a',
      estimatedCents: 2000,
      actualCents: 1500,
      complete: true,
    }),
    materialOf('m3', { estimatedCents: 700, complete: true }),
  ],
});

test('materialExpected falls back to the allowance when no estimate is entered', () => {
  assert.equal(materialExpected(materialOf('x'), 0), 12000);
  assert.equal(
    materialExpected(materialOf('x', { estimatedCents: 0 }), 0),
    10000,
  );
  assert.equal(
    materialExpected(
      materialOf('x', { estimatedCents: 0, allowanceCents: 0 }),
      0,
    ),
    0,
  );
  // Approved change orders add to the estimate, or to the allowance
  // that stands in for it.
  assert.equal(materialExpected(materialOf('x'), 500), 12500);
  assert.equal(
    materialExpected(materialOf('x', { estimatedCents: 0 }), 500),
    10500,
  );
});

test('landingDate follows the expected date, then the item, then the project', () => {
  assert.deepEqual(landingDate(payload.materials[0], payload), {
    date: '2026-12-02',
    inferred: false,
  });
  assert.deepEqual(landingDate(payload.materials[1], payload), {
    date: '2026-10-01',
    inferred: true,
  });
  assert.deepEqual(landingDate(payload.materials[2], payload), {
    date: '2026-09-01',
    inferred: true,
  });
});

test('costEvents lands each row on one day in date order', () => {
  const events = costEvents(payload);
  assert.deepEqual(
    events.map((e) => [
      e.id,
      e.source,
      e.date,
      e.expectedCents,
      e.invoicedCents,
      e.billedCents,
    ]),
    [
      // Typed prices are billed but not invoiced.
      ['m3', 'material', '2026-09-01', 700, null, null],
      ['m2', 'material', '2026-10-01', 2000, null, 1500],
      ['a', 'schedule', '2026-10-03', 10000, null, 12000],
      ['b', 'schedule', '2026-10-20', 30000, null, 4000],
      ['m1', 'material', '2026-12-02', 5000, null, 800],
    ],
  );
  assert.equal(events[0].title, 'Material m3');
  assert.equal(events[0].complete, true);
  assert.equal(events[3].complete, false);
});

/** @param {import('../../../src/costs/timeline.js').CostEvent[]} events */
const estimates = (events) =>
  events.map((e) => ({ date: e.date, cents: e.expectedCents }));

test('cumulative sums by day', () => {
  assert.deepEqual(cumulative(estimates(costEvents(payload))), [
    { date: '2026-09-01', cents: 700 },
    { date: '2026-10-01', cents: 2700 },
    { date: '2026-10-03', cents: 12700 },
    { date: '2026-10-20', cents: 42700 },
    { date: '2026-12-02', cents: 47700 },
  ]);
  assert.deepEqual(cumulative([]), []);
});

test('cumulative merges two costs on the same day into one point', () => {
  const twice = costEvents({
    ...payload,
    materials: [],
    schedule: [
      itemOf('x', { endDate: '2026-10-03', estimatedCents: 100 }),
      itemOf('y', { endDate: '2026-10-03', estimatedCents: 250 }),
    ],
  });
  assert.deepEqual(cumulative(estimates(twice)), [
    { date: '2026-10-03', cents: 350 },
  ]);
});

test('invoiceEvents lands each invoice total on its issue day', () => {
  const events = invoiceEvents({
    ...payload,
    invoices: [
      invoiceOf('late', {
        number: '7',
        issuedDate: '2026-11-02',
        markupBasisPoints: 1000,
        lines: [
          lineOf({ scheduleItemId: 'a' }, 1005),
          lineOf({ materialItemId: 'm1' }, 1000),
        ],
      }),
      invoiceOf('early', {
        issuedDate: '2026-09-20',
        lines: [lineOf({ scheduleItemId: 'b' }, 400)],
      }),
    ],
  });
  assert.deepEqual(events, [
    {
      id: 'early',
      title: 'An invoice from Party early',
      date: '2026-09-20',
      cents: 400,
    },
    // 2005 plus 10% rounded once on the sum.
    {
      id: 'late',
      title: 'Invoice 7 from Party late',
      date: '2026-11-02',
      cents: 2206,
    },
  ]);
});

test('costEvents invoiced sums match the invoice totals', () => {
  const invoiced = {
    ...payload,
    project: { ...payload.project, markupBasisPoints: 2500 },
    invoices: [
      invoiceOf('i1', {
        markupBasisPoints: 3333,
        lines: [
          lineOf({ scheduleItemId: 'a' }, 1001),
          lineOf({ scheduleItemId: 'b' }, 1001),
          lineOf({ materialItemId: 'm1' }, 1001),
        ],
      }),
      invoiceOf('i2', {
        markupBasisPoints: 1500,
        lines: [lineOf({ scheduleItemId: 'a' }, 333)],
      }),
    ],
  };
  const rows = costEvents(invoiced).reduce(
    (sum, e) => sum + (e.invoicedCents ?? 0),
    0,
  );
  const docs = invoiceEvents(invoiced).reduce((sum, e) => sum + e.cents, 0);
  assert.equal(rows, docs);
  // An open row with an invoice line is invoiced. Its markup share is
  // 667 on the first two lines less the 334 on the first.
  const b = costEvents(invoiced).find((e) => e.id === 'b');
  assert.equal(b?.complete, false);
  assert.equal(b?.invoicedCents, 1334);
});

test('byWeek fills the empty weeks between the first and the last', () => {
  const invoices = [
    { id: 'i', title: 'i', date: '2026-10-02', cents: 900 },
    { id: 'j', title: 'j', date: '2026-10-03', cents: 100 },
  ];
  const weeks = byWeek(costEvents(payload), invoices);
  // Aug 30 through Nov 29 is fourteen Sundays.
  assert.equal(weeks.length, 14);
  assert.deepEqual(weeks[0], {
    week: '2026-08-30',
    expectedCents: 700,
    actualCents: 0,
  });
  // Oct 1 and Oct 3 fall in the same week, and so do both invoices.
  assert.deepEqual(weeks[4], {
    week: '2026-09-27',
    expectedCents: 12000,
    actualCents: 1000,
  });
  assert.deepEqual(weeks[7], {
    week: '2026-10-18',
    expectedCents: 30000,
    actualCents: 0,
  });
  assert.deepEqual(weeks[8], {
    week: '2026-10-25',
    expectedCents: 0,
    actualCents: 0,
  });
  assert.deepEqual(weeks[13], {
    week: '2026-11-29',
    expectedCents: 5000,
    actualCents: 0,
  });
  assert.deepEqual(byWeek([], []), []);
});

test('byWeek stretches to an invoice outside the estimates', () => {
  const weeks = byWeek(
    [],
    [{ id: 'i', title: 'i', date: '2026-10-14', cents: 900 }],
  );
  assert.deepEqual(weeks, [
    { week: '2026-10-11', expectedCents: 0, actualCents: 900 },
  ]);
});

test('costEvents adds the invoice rate to billed rows and the project rate elsewhere', () => {
  const events = costEvents({
    ...payload,
    project: { ...payload.project, markupBasisPoints: 1000 },
    schedule: [
      itemOf('a', { estimatedCents: 10_000, actualCents: 1, complete: true }),
      itemOf('b', { endDate: '2026-10-09', estimatedCents: 5_000 }),
      itemOf('c', { endDate: '2026-10-10', actualCents: 2_000 }),
    ],
    materials: [],
    invoices: [
      invoiceOf('i', {
        markupBasisPoints: 2000,
        lines: [
          {
            id: 'l',
            scheduleItemId: 'a',
            materialItemId: null,
            description: '',
            amountCents: 9_000,
            markupBasisPoints: null,
          },
        ],
      }),
    ],
  });
  assert.deepEqual(
    events.map((e) => [
      e.id,
      e.expectedCents,
      e.expectedMarkupCents,
      e.invoicedCents,
      e.billedCents,
      e.billedMarkupCents,
    ]),
    [
      // Billed: base from the line, markup at the invoice's 20%.
      ['a', 11_000, 1_000, 10_800, 10_800, 1_800],
      ['b', 5_500, 500, null, null, null],
      // A typed price takes the project rate and is not invoiced.
      ['c', 11_000, 1_000, null, 2_200, 200],
    ],
  );
});

test('costEvents adds a row rate over the project rate on estimates and typed prices', () => {
  const events = costEvents({
    ...payload,
    project: { ...payload.project, markupBasisPoints: 1000 },
    schedule: [
      itemOf('a', { estimatedCents: 10_000, markupBasisPoints: 2500 }),
      itemOf('b', {
        endDate: '2026-10-09',
        estimatedCents: 10_000,
        actualCents: 4_000,
        markupBasisPoints: 0,
      }),
    ],
    materials: [
      materialOf('m', {
        expectedDate: '2026-10-10',
        estimatedCents: 2_000,
        markupBasisPoints: 5000,
      }),
    ],
    invoices: [],
    changeOrders: [],
  });
  assert.deepEqual(
    events.map((e) => [
      e.id,
      e.expectedCents,
      e.expectedMarkupCents,
      e.billedCents,
    ]),
    [
      ['a', 12_500, 2_500, null],
      ['b', 10_000, 0, 4_000],
      ['m', 3_000, 1_000, null],
    ],
  );
});

test('costEvents adds approved change order lines to the estimate at the change order rate', () => {
  const events = costEvents({
    ...payload,
    project: { ...payload.project, markupBasisPoints: 1000 },
    changeOrders: [
      changeOrderOf('c1', {
        markupBasisPoints: 500,
        lines: [
          lineOf({ scheduleItemId: 'a' }, 2000),
          lineOf({ materialItemId: 'm3' }, 300),
        ],
      }),
      changeOrderOf('c2', {
        approved: false,
        lines: [lineOf({ scheduleItemId: 'b' }, 9000)],
      }),
    ],
  });
  const byId = new Map(events.map((e) => [e.id, e]));
  // 10000 typed at the 10% project rate, plus 2000 approved at the 5%
  // change order rate.
  assert.equal(byId.get('a')?.expectedCents, 13100);
  assert.equal(byId.get('a')?.expectedMarkupCents, 1100);
  // The change order rounds its markup once: 115 on 2300, so the second
  // line takes 15.
  assert.equal(byId.get('m3')?.expectedCents, 1085);
  // A pending change order adds nothing.
  assert.equal(byId.get('b')?.expectedCents, 33000);
});
