// The one form for a project: name, start date, budget. It opens in a
// modal for both a new project and edits to an open one. The dialog owns
// field errors; the caller owns the write.
import { ApiError } from '../api/errors.js';
import { validateProject } from '../entities/project.js';
import { todayIso } from '../schedule/dates.js';
import { button } from '../ui/buttons.js';
import { dateField, form, moneyField, textField } from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';

/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */
/** @typedef {import('./context.js').WriteOutcome<unknown>} Outcome */

let counter = 0;

/**
 * @param {{
 *   project?: Project,
 *   onSave: (input: Required<ProjectInput>) => Promise<Outcome>,
 * }} config onSave resolves to the write outcome; the dialog closes on ok
 * @returns {import('../ui/Modal.js').ModalHandle}
 */
export function openProjectDialog({ project, onSave }) {
  const prefix = `project-${++counter}`;
  const editing = project !== undefined;

  const name = textField({
    id: `${prefix}-name`,
    label: 'Name',
    value: project?.name ?? '',
    placeholder: 'Kitchen remodel',
    required: true,
    wide: true,
  });
  name.input.setAttribute('autofocus', '');
  const startDate = dateField({
    id: `${prefix}-start`,
    label: 'Start date',
    value: project?.startDate ?? todayIso(),
    required: true,
  });
  const budget = moneyField({
    id: `${prefix}-budget`,
    label: 'Budget',
    cents: project?.budgetCents ?? 0,
  });
  const fields = { name, startDate, budgetCents: budget };

  const save = button({
    label: editing ? 'Save' : 'Start project',
    variant: 'primary',
    type: 'submit',
  });
  const formEl = form({
    ariaLabel: editing ? 'Project settings' : 'New project',
    onSubmit: submit,
  });
  formEl.id = `${prefix}-form`;
  save.setAttribute('form', formEl.id);
  formEl.append(name.el, startDate.el, budget.el);

  const dialog = modal({
    title: editing ? `Edit ${project.name}` : 'New project',
    body: [formEl],
    actions: [button({ label: 'Cancel', onClick: () => dialog.close() }), save],
    onClose: () => dialog.el.remove(),
  });

  /** @param {'name' | 'startDate' | 'budgetCents'} field @param {string | null} message */
  function mark(field, message) {
    fields[field].setError(message);
  }

  async function submit() {
    mark('name', null);
    mark('startDate', null);
    mark('budgetCents', null);
    const cents = budget.cents();
    if (cents === null) {
      mark('budgetCents', 'Budget must be dollars and cents, like 12,500.00');
      return;
    }
    const input = {
      name: name.input.value.trim(),
      startDate: startDate.input.value,
      budgetCents: cents,
    };
    const problem = validateProject(input);
    if (problem) {
      mark(/** @type {keyof typeof fields} */ (problem.field), problem.message);
      return;
    }
    save.disabled = true;
    const outcome = await onSave(input);
    save.disabled = false;
    if (outcome.ok) {
      dialog.close();
      return;
    }
    const { error } = outcome;
    if (error instanceof ApiError && error.field && error.field in fields) {
      mark(/** @type {keyof typeof fields} */ (error.field), error.message);
    }
  }

  document.body.append(dialog.el);
  dialog.open();
  return dialog;
}
