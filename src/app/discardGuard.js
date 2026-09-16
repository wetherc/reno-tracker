// The check an editor runs before it closes on Escape, the x button, or
// Cancel. It compares every field with the value it opened with and
// asks before unsaved edits are thrown away. A save closes through
// close(), which skips the check.
import { confirmDialog } from '../ui/ConfirmDialog.js';

/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */

/**
 * @param {Record<string, FieldHandle>} fields read once now for the baseline
 * @returns {() => Promise<boolean>} true when the dialog may close
 */
export function discardGuard(fields) {
  const snapshot = () =>
    JSON.stringify(Object.values(fields).map((f) => f.input.value));
  const initial = snapshot();
  return async () =>
    snapshot() === initial ||
    confirmDialog({
      title: 'Discard changes?',
      message: 'The edits in this form are not saved.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    });
}
