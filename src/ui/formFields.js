// Labeled form controls. Each builder returns a handle with the row
// element, the control, and setError, which links the message through
// aria-describedby so a screen reader hears it with the field.
import { centsToInput, parseMoney } from '../format/money.js';
import { parsePercent, percentToInput } from '../format/percent.js';
import { MAX_DATE, MIN_DATE } from '../schedule/dates.js';

/**
 * @typedef {{
 *   el: HTMLDivElement,
 *   input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
 *   setError(message: string | null): void,
 * }} FieldHandle
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   value?: string,
 *   placeholder?: string,
 *   required?: boolean,
 *   wide?: boolean,
 *   onInput?: (value: string) => void,
 * }} FieldOptions
 */

/**
 * @param {FieldOptions} options
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} input
 * @returns {FieldHandle}
 */
function fieldRow({ id, label, required = false, wide = false }, input) {
  const el = document.createElement('div');
  el.className = wide ? 'form__row form__wide' : 'form__row';
  const labelEl = document.createElement('label');
  labelEl.className = 'form__label';
  labelEl.htmlFor = id;
  labelEl.append(label);
  input.id = id;
  input.classList.add('field');
  if (required) input.required = true;
  const error = document.createElement('p');
  error.className = 'form__error';
  error.id = `${id}-error`;
  error.hidden = true;
  el.append(labelEl, input, error);
  // A hint that the caller links through aria-describedby stays linked
  // when the error comes and goes.
  const hints = () =>
    (input.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter((ref) => ref && ref !== error.id);
  /** @param {string[]} refs */
  const describe = (refs) =>
    refs.length
      ? input.setAttribute('aria-describedby', refs.join(' '))
      : input.removeAttribute('aria-describedby');
  return {
    el,
    input,
    setError(message) {
      if (message) {
        error.textContent = message;
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        describe([error.id, ...hints()]);
      } else {
        error.textContent = '';
        error.hidden = true;
        input.removeAttribute('aria-invalid');
        describe(hints());
      }
    },
  };
}

/**
 * @param {string} type
 * @param {FieldOptions} options
 * @returns {HTMLInputElement}
 */
function inputOf(type, { value = '', placeholder, onInput }) {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  if (onInput) input.addEventListener('input', () => onInput(input.value));
  return input;
}

/** @param {FieldOptions} options @returns {FieldHandle} */
export function textField(options) {
  return fieldRow(options, inputOf('text', options));
}

/** @param {FieldOptions} options @returns {FieldHandle} */
export function textArea(options) {
  const input = document.createElement('textarea');
  input.value = options.value ?? '';
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.onInput) {
    const notify = options.onInput;
    input.addEventListener('input', () => notify(input.value));
  }
  return fieldRow({ wide: true, ...options }, input);
}

/** @param {FieldOptions} options @returns {FieldHandle} */
export function dateField(options) {
  const input = inputOf('date', options);
  input.setAttribute('min', MIN_DATE);
  input.setAttribute('max', MAX_DATE);
  return fieldRow(options, input);
}

/**
 * Whole numbers.
 * @param {FieldOptions & { min?: number, max?: number }} options
 * @returns {FieldHandle}
 */
export function numberField(options) {
  const input = inputOf('number', options);
  input.classList.add('form__number');
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('step', '1');
  if (options.min !== undefined) input.setAttribute('min', String(options.min));
  if (options.max !== undefined) input.setAttribute('max', String(options.max));
  return fieldRow(options, input);
}

/**
 * Dollars and cents typed as text. `cents()` reads the value as whole
 * cents, or null when the text is not money, and null (not zero) when
 * the field is blank and `blankIsNull` is set.
 * @param {Omit<FieldOptions, 'value'> & { cents?: number | null, blankIsNull?: boolean }} options
 * @returns {FieldHandle & { cents(): number | null }}
 */
export function moneyField(options) {
  const input = inputOf('text', {
    ...options,
    value: centsToInput(options.cents),
    placeholder: options.placeholder ?? '0.00',
  });
  input.classList.add('form__number');
  input.setAttribute('inputmode', 'decimal');
  const handle = fieldRow(options, input);
  return {
    ...handle,
    cents() {
      if (options.blankIsNull && input.value.trim() === '') return null;
      return parseMoney(input.value);
    },
  };
}

/**
 * A percent typed as text, such as 12.5. `basisPoints()` reads the value
 * as whole basis points, or null when the text is not a percent from 0
 * to 100. A blank field reads as zero.
 * @param {Omit<FieldOptions, 'value'> & { basisPoints?: number }} options
 * @returns {FieldHandle & { basisPoints(): number | null }}
 */
export function percentField(options) {
  const input = inputOf('text', {
    ...options,
    value: percentToInput(options.basisPoints ?? 0),
    placeholder: options.placeholder ?? '0',
  });
  input.classList.add('form__number');
  input.setAttribute('inputmode', 'decimal');
  const handle = fieldRow(options, input);
  return { ...handle, basisPoints: () => parsePercent(input.value) };
}

/**
 * @param {Omit<FieldOptions, 'onInput'> & { options: { value: string, label: string }[], onChange?: (value: string) => void }} options
 * @returns {FieldHandle}
 */
export function selectField(options) {
  const select = document.createElement('select');
  for (const choice of options.options) {
    const opt = document.createElement('option');
    opt.value = choice.value;
    opt.append(choice.label);
    if (choice.value === options.value) opt.selected = true;
    select.append(opt);
  }
  if (options.value !== undefined) select.value = options.value;
  if (options.onChange) {
    const notify = options.onChange;
    select.addEventListener('change', () => notify(select.value));
  }
  return fieldRow(options, select);
}

/**
 * The grid that holds rows. Submit is prevented and passed to onSubmit
 * so a form never reloads the page.
 * @param {{ onSubmit?: () => void, ariaLabel?: string }} [options]
 * @returns {HTMLFormElement}
 */
export function form({ onSubmit, ariaLabel } = {}) {
  const el = document.createElement('form');
  el.className = 'form';
  el.setAttribute('novalidate', '');
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  el.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit?.();
  });
  return el;
}

/**
 * A row of buttons at the end of a form.
 * @param {HTMLElement[]} buttons
 * @returns {HTMLDivElement}
 */
export function formActions(buttons) {
  const el = document.createElement('div');
  el.className = 'form__actions';
  el.append(...buttons);
  return el;
}
