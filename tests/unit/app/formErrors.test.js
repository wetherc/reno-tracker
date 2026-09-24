import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { readable, showProblems } from '../../../src/app/formErrors.js';
import { textField } from '../../../src/ui/formFields.js';

const dom = installDom();

test('readable swaps field names for labels and capitalizes', () => {
  const labels = { startDate: 'Start', endDate: 'End' };
  assert.equal(
    readable('endDate 2026-01-04 is before startDate 2026-01-05', labels),
    'End 2026-01-04 is before Start 2026-01-05',
  );
  assert.equal(readable('no such item', labels), 'No such item');
  assert.equal(readable('', labels), '');
});

test('showProblems marks every known field and focuses the first', () => {
  const fields = {
    a: textField({ id: 'a', label: 'A' }),
    b: textField({ id: 'b', label: 'B' }),
  };
  const labels = { a: 'Alpha', b: 'Beta' };
  assert.equal(
    showProblems(
      fields,
      [
        { field: 'b', message: 'b is bad' },
        { field: 'b', message: 'b is worse' },
        { field: 'a', message: 'a is bad' },
        { field: 'zz', message: 'no field' },
      ],
      labels,
    ),
    true,
  );
  assert.equal(dom.activeElement, fields.a.input);
  assert.equal(fields.b.input.getAttribute('aria-invalid'), 'true');
  assert.equal(
    fields.b.el.querySelector('.form__error')?.textContent,
    'Beta is bad',
  );
  dom.activeElement = null;
  assert.equal(
    showProblems(fields, [{ field: 'zz', message: 'x' }], labels),
    false,
  );
  assert.equal(dom.activeElement, null);
  assert.equal(fields.a.input.getAttribute('aria-invalid'), null);
});
