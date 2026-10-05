import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changeOrderDefaults,
  changeOrderErrors,
  changeOrderName,
  changeOrderNameInSentence,
  changeOrderTotal,
  cleanChangeOrderInput,
  validateChangeOrder,
} from '../../../src/entities/changeOrder.js';

const line = { scheduleItemId: 'a', amountCents: 100 };

test('a change order needs a party, an issue day, and a line', () => {
  assert.deepEqual(
    changeOrderErrors({}).map((e) => e.field),
    ['party', 'issuedDate', 'lines'],
  );
  assert.equal(
    validateChangeOrder({
      party: 'P',
      issuedDate: '2026-01-05',
      lines: [line],
    }),
    null,
  );
  assert.deepEqual(
    changeOrderErrors({ description: 'x'.repeat(1001) }, { partial: true }),
    [
      {
        field: 'description',
        message: 'description is over 1000 characters',
      },
    ],
  );
  assert.equal(validateChangeOrder({ number: '7' }, { partial: true }), null);
});

test('defaults fill every field and keep only known line keys', () => {
  const clean = cleanChangeOrderInput({
    party: 'P',
    issuedDate: '2026-01-05',
    lines: [{ ...line, extra: 1 }],
  });
  assert.deepEqual(changeOrderDefaults(clean, 1500), {
    number: '',
    party: 'P',
    issuedDate: '2026-01-05',
    approved: false,
    markupBasisPoints: 1500,
    description: '',
    lines: [
      {
        scheduleItemId: 'a',
        materialItemId: null,
        description: '',
        amountCents: 100,
        markupBasisPoints: null,
      },
    ],
  });
  assert.deepEqual(cleanChangeOrderInput({ approved: true }), {
    approved: true,
  });
  assert.deepEqual(changeOrderDefaults({}, 0).lines, []);
  // A body with its own rate keeps it over the project rate.
  assert.equal(
    changeOrderDefaults({ markupBasisPoints: 500 }, 1500).markupBasisPoints,
    500,
  );
});

test('a change order goes by its number and party, and totals its lines', () => {
  assert.equal(
    changeOrderName({ number: '7', party: 'Pinch' }),
    'Change order 7 from Pinch',
  );
  assert.equal(
    changeOrderNameInSentence({ number: '', party: 'Pinch' }),
    'a change order from Pinch',
  );
  assert.equal(
    changeOrderTotal({
      markupBasisPoints: 0,
      lines: [{ amountCents: 5 }, { amountCents: 7 }],
    }),
    12,
  );
  // The markup rounds once, on the sum of the lines.
  assert.equal(
    changeOrderTotal({
      markupBasisPoints: 1000,
      lines: [{ amountCents: 1005 }, { amountCents: 1000 }],
    }),
    2206,
  );
});
