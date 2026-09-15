import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  dateField,
  form,
  formActions,
  moneyField,
  numberField,
  selectField,
  textArea,
  textField,
} from '../../../src/ui/formFields.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

test('textField links label, input, and error', () => {
  /** @type {string[]} */
  const seen = [];
  const field = textField({
    id: 'title',
    label: 'Title',
    value: 'Demo',
    placeholder: 'What happens',
    required: true,
    onInput: (v) => seen.push(v),
  });
  const [label, input, error] = field.el.children;
  assert.equal(field.el.className, 'form__row');
  assert.equal($(label).htmlFor, 'title');
  assert.equal(label.textContent, 'Title');
  assert.equal(input.id, 'title');
  assert.equal($(input).type, 'text');
  assert.equal($(input).value, 'Demo');
  assert.equal($(input).placeholder, 'What happens');
  assert.equal($(input).required, true);
  assert.equal(input.className, 'field');
  assert.equal($(error).hidden, true);

  $(input).value = 'Demo 2';
  input.dispatchEvent($({ type: 'input' }));
  assert.deepEqual(seen, ['Demo 2']);

  field.setError('Title cannot be blank');
  assert.equal(error.textContent, 'Title cannot be blank');
  assert.equal($(error).hidden, false);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(input.getAttribute('aria-describedby'), 'title-error');
  field.setError(null);
  assert.equal($(error).hidden, true);
  assert.equal(input.getAttribute('aria-invalid'), null);
  assert.equal(input.getAttribute('aria-describedby'), null);
});

test('textArea is wide by default and reports input', () => {
  /** @type {string[]} */
  const seen = [];
  const field = textArea({
    id: 'desc',
    label: 'Description',
    placeholder: 'Notes',
    onInput: (v) => seen.push(v),
  });
  assert.equal(field.el.className, 'form__row form__wide');
  assert.equal(field.input.tagName, 'TEXTAREA');
  assert.equal($(field.input).placeholder, 'Notes');
  $(field.input).value = 'x';
  field.input.dispatchEvent($({ type: 'input' }));
  assert.deepEqual(seen, ['x']);
  const narrow = textArea({ id: 'd2', label: 'D', wide: false, value: 'v' });
  assert.equal(narrow.el.className, 'form__row');
  assert.equal($(narrow.input).value, 'v');
});

test('dateField and numberField set input types and limits', () => {
  const date = dateField({ id: 'start', label: 'Start' });
  assert.equal($(date.input).type, 'date');
  const num = numberField({ id: 'days', label: 'Days', min: 1, max: 30 });
  assert.equal($(num.input).type, 'number');
  assert.equal(num.input.getAttribute('min'), '1');
  assert.equal(num.input.getAttribute('max'), '30');
  assert.equal(num.input.getAttribute('inputmode'), 'numeric');
  assert.equal(num.input.className, 'form__number field');
  const open = numberField({ id: 'n', label: 'N' });
  assert.equal(open.input.getAttribute('min'), null);
});

test('moneyField reads cents and flags junk', () => {
  const field = moneyField({ id: 'est', label: 'Estimated', cents: 123456 });
  assert.equal($(field.input).value, '1234.56');
  assert.equal($(field.input).placeholder, '0.00');
  assert.equal(field.input.getAttribute('inputmode'), 'decimal');
  assert.equal(field.cents(), 123456);
  $(field.input).value = 'abc';
  assert.equal(field.cents(), null);
  $(field.input).value = '';
  assert.equal(field.cents(), 0);
  const actual = moneyField({
    id: 'act',
    label: 'Actual',
    cents: null,
    blankIsNull: true,
    placeholder: 'Not yet',
  });
  assert.equal($(actual.input).value, '');
  assert.equal($(actual.input).placeholder, 'Not yet');
  assert.equal(actual.cents(), null);
  $(actual.input).value = ' 12 ';
  assert.equal(actual.cents(), 1200);
});

test('selectField builds options and reports change', () => {
  /** @type {string[]} */
  const seen = [];
  const field = selectField({
    id: 'party',
    label: 'Party',
    value: 'b',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
    onChange: (v) => seen.push(v),
  });
  assert.equal(field.input.tagName, 'SELECT');
  assert.equal(field.input.children.length, 2);
  assert.equal($(field.input.children[1]).selected, true);
  assert.equal($(field.input).value, 'b');
  $(field.input).value = 'a';
  field.input.dispatchEvent($({ type: 'change' }));
  assert.deepEqual(seen, ['a']);
  const bare = selectField({ id: 's', label: 'S', options: [] });
  assert.equal(bare.input.children.length, 0);
});

test('form prevents native submit and formActions groups buttons', () => {
  let submits = 0;
  const el = form({ onSubmit: () => submits++, ariaLabel: 'New item' });
  assert.equal(el.className, 'form');
  assert.equal(el.getAttribute('novalidate'), '');
  assert.equal(el.getAttribute('aria-label'), 'New item');
  const allowed = el.dispatchEvent($({ type: 'submit' }));
  assert.equal(allowed, false);
  assert.equal(submits, 1);
  form().dispatchEvent($({ type: 'submit' }));
  const btn = document.createElement('button');
  const actions = formActions([btn]);
  assert.equal(actions.className, 'form__actions');
  assert.equal(actions.children[0], btn);
});
