// Shows a form's problems under their fields. Every bad field gets its
// message at once, and the first bad field in form order takes focus, so
// a screen reader reads its message through aria-describedby.

/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */
/** @typedef {import('../entities/validate.js').FieldError} FieldError */

/**
 * The text a form shows for a check's message. The checks name fields by
 * their API names, such as endDate, so each name becomes the label on
 * screen, and the first letter becomes a capital.
 * @param {string} message
 * @param {Record<string, string>} labels label per field name
 * @returns {string}
 */
export function readable(message, labels) {
  let text = message;
  for (const [field, label] of Object.entries(labels)) {
    text = text.replace(new RegExp(`\\b${field}\\b`, 'g'), label);
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Sets or clears the message on every field and focuses the first bad
 * one. A problem for a field the form lacks is left out.
 * @param {Record<string, FieldHandle>} fields in form order
 * @param {FieldError[]} problems the first problem per field wins
 * @param {Record<string, string>} labels
 * @returns {boolean} true when a field shows a problem
 */
export function showProblems(fields, problems, labels) {
  /** @type {Map<string, string>} */
  const messages = new Map();
  for (const { field, message } of problems) {
    if (field in fields && !messages.has(field)) {
      messages.set(field, readable(message, labels));
    }
  }
  /** @type {FieldHandle | null} */
  let firstBad = null;
  for (const [name, handle] of Object.entries(fields)) {
    const message = messages.get(name) ?? null;
    handle.setError(message);
    if (message) firstBad ??= handle;
  }
  firstBad?.input.focus();
  return firstBad !== null;
}
