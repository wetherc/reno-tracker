// The one form for a project: name, start date, budget, and markup. It opens in a
// modal for both a new project and edits to an open one. The dialog owns
// field errors; the caller owns the write.
import { ApiError } from '../api/errors.js';
import { projectErrors } from '../entities/project.js';
import { todayIso } from '../schedule/dates.js';
import { button } from '../ui/buttons.js';
import {
  dateField,
  form,
  moneyField,
  percentField,
  textField,
} from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';
import { discardGuard } from './discardGuard.js';
import { showProblems } from './formErrors.js';

/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */
/** @typedef {import('./context.js').WriteOutcome<unknown>} Outcome */

/** The message for a markup field that does not read as a percent. */
export const MARKUP_MESSAGE =
  'Markup must be a percent from 0 to 100, like 15 or 12.5';

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
  const markup = percentField({
    id: `${prefix}-markup`,
    label: 'Markup (%)',
    basisPoints: project?.markupBasisPoints ?? 0,
  });
  const markupHint = document.createElement('p');
  markupHint.className = 'form__hint';
  markupHint.id = `${prefix}-markup-hint`;
  markupHint.textContent =
    'Added to every estimate. Each new invoice starts with it.';
  markup.input.setAttribute('aria-describedby', markupHint.id);
  markup.el.append(markupHint);
  const fields = {
    name,
    startDate,
    budgetCents: budget,
    markupBasisPoints: markup,
  };

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
  formEl.append(name.el, startDate.el, budget.el, markup.el);

  const dialog = modal({
    title: editing ? `Edit ${project.name}` : 'New project',
    body: [formEl],
    actions: [
      button({ label: 'Cancel', onClick: () => dialog.requestClose() }),
      save,
    ],
    beforeClose: discardGuard(fields),
    onClose: () => dialog.el.remove(),
  });

  const labels = {
    name: 'Name',
    startDate: 'Start date',
    budgetCents: 'Budget',
    markupBasisPoints: 'Markup',
  };

  async function submit() {
    const cents = budget.cents();
    const basisPoints = markup.basisPoints();
    const input = {
      name: name.input.value.trim(),
      startDate: startDate.input.value,
      budgetCents: cents ?? 0,
      markupBasisPoints: basisPoints ?? 0,
    };
    const problems = projectErrors(input);
    if (cents === null) {
      problems.unshift({
        field: 'budgetCents',
        message: 'Budget must be dollars and cents, like 12,500.00',
      });
    }
    if (basisPoints === null) {
      problems.unshift({
        field: 'markupBasisPoints',
        message: MARKUP_MESSAGE,
      });
    }
    if (showProblems(fields, problems, labels)) return;
    save.disabled = true;
    const outcome = await onSave(input);
    save.disabled = false;
    if (outcome.ok) {
      dialog.close();
      return;
    }
    const { error } = outcome;
    if (error instanceof ApiError && error.field) {
      showProblems(
        fields,
        [{ field: error.field, message: error.message }],
        labels,
      );
    }
  }

  document.body.append(dialog.el);
  dialog.open();
  return dialog;
}
