// The editor for one change order. The number, the party, the issue
// day, and the status sit at the top, then the reason. Under them, each
// line picks the schedule item or material it adds to, an amount, and
// an optional note, and a running total follows the amounts. Only an
// approved change order adds its lines to the estimates.
import { ApiError } from '../api/errors.js';
import {
  changeOrderErrors,
  changeOrderName,
  changeOrderNameInSentence as nameInSentence,
  changeOrderTotal,
} from '../entities/changeOrder.js';
import { formatCents } from '../format/money.js';
import { todayIso } from '../schedule/dates.js';
import { button } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import {
  dateField,
  form,
  selectField,
  textArea,
  textField,
} from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';
import { discardGuard } from './discardGuard.js';
import { readable, showProblems } from './formErrors.js';
import { LINE_LABELS, lineList } from './lineList.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {import('../types.ts').ChangeOrderInput} ChangeOrderInput */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */

export const CHANGE_ORDER_LABELS = {
  number: 'Change order no.',
  party: 'From',
  issuedDate: 'Dated',
  approved: 'Status',
  description: 'Reason',
};

/**
 * Puts the line labels in the messages of line problems first, because
 * a line's description is its Note while the change order's own
 * description is its Reason.
 * @param {import('../entities/validate.js').FieldError[]} problems
 */
const withLineLabels = (problems) =>
  problems.map((p) =>
    p.field.startsWith('lines.')
      ? { ...p, message: readable(p.message, LINE_LABELS) }
      : p,
  );

/** The select values of the status field. */
const STATUS = { pending: 'pending', approved: 'approved' };

let counter = 0;

/**
 * @param {{ ctx: AppContext, order?: ChangeOrder }} config
 * @returns {import('../ui/Modal.js').ModalHandle}
 */
export function openChangeOrderEditor({ ctx, order }) {
  const prefix = `change-order-${++counter}`;
  const editing = order !== undefined;
  const payload = /** @type {ProjectPayload} */ (ctx.payload);
  const projectId = payload.project.id;

  const number = textField({
    id: `${prefix}-number`,
    label: CHANGE_ORDER_LABELS.number,
    value: order?.number ?? '',
    placeholder: 'Optional',
  });
  const party = textField({
    id: `${prefix}-party`,
    label: CHANGE_ORDER_LABELS.party,
    value: order?.party ?? '',
    placeholder: 'Pinch Plumbing',
    required: true,
  });
  party.input.setAttribute('autofocus', '');
  const issuedDate = dateField({
    id: `${prefix}-issued`,
    label: CHANGE_ORDER_LABELS.issuedDate,
    value: order?.issuedDate ?? todayIso(),
    required: true,
  });
  const approved = selectField({
    id: `${prefix}-status`,
    label: CHANGE_ORDER_LABELS.approved,
    value: order?.approved ? STATUS.approved : STATUS.pending,
    options: [
      { value: STATUS.pending, label: 'Pending, adds nothing yet' },
      { value: STATUS.approved, label: 'Approved, adds to estimates' },
    ],
  });
  const description = textArea({
    id: `${prefix}-reason`,
    label: CHANGE_ORDER_LABELS.description,
    value: order?.description ?? '',
    placeholder: 'What changed and why. Optional.',
  });
  const head = { number, party, issuedDate, approved, description };

  const total = document.createElement('p');
  total.className = 'line-list__total';
  total.setAttribute('aria-live', 'polite');
  /** @type {ReturnType<typeof lineList> | undefined} */
  let lines;
  const showTotal = () => {
    total.textContent = `Total ${formatCents(
      changeOrderTotal({ lines: lines?.amounts() ?? [] }),
    )}`;
  };
  lines = lineList({
    prefix,
    payload,
    lines: order?.lines,
    rowLabel: 'Adds to',
    onChange: showTotal,
  });
  showTotal();

  const formEl = form({
    ariaLabel: editing ? 'Edit change order' : 'New change order',
    onSubmit: submit,
  });
  formEl.id = `${prefix}-form`;
  formEl.classList.add('form--pairs');
  formEl.append(
    number.el,
    party.el,
    issuedDate.el,
    approved.el,
    description.el,
    lines.fieldset(total),
  );
  const initialLines = lines.text();

  const save = button({
    label: editing ? 'Save' : 'Add change order',
    variant: 'primary',
    type: 'submit',
  });
  save.setAttribute('form', formEl.id);
  const actions = [
    button({ label: 'Cancel', onClick: () => dialog.requestClose() }),
    save,
  ];
  if (editing) {
    const remove = button({
      label: 'Delete',
      variant: 'danger',
      icon: 'trash',
      onClick: deleteOrder,
    });
    remove.classList.add('editor__delete');
    actions.unshift(remove);
  }

  const dialog = modal({
    title: editing ? changeOrderName(order) : 'New change order',
    body: [formEl],
    actions,
    wide: true,
    beforeClose: discardGuard(head, () => lines?.text() !== initialLines),
    onClose: () => {
      unsubscribe();
      dialog.el.remove();
    },
  });

  // A write elsewhere refetches the project. If this change order is
  // gone, the editor closes.
  const unsubscribe = ctx.on('payload', (next) => {
    if (!editing) return;
    if (!next || !next.changeOrders.some((c) => c.id === order.id)) {
      dialog.close();
    }
  });

  /** @returns {Record<string, FieldHandle>} every field in form order */
  const allFields = () => ({ ...head, ...lines?.fields() });

  /** @returns {Required<ChangeOrderInput> | null} */
  function readForm() {
    /** @type {import('../entities/validate.js').FieldError[]} */
    const problems = [];
    const input = {
      number: number.input.value.trim(),
      party: party.input.value.trim(),
      issuedDate: issuedDate.input.value,
      approved: approved.input.value === STATUS.approved,
      description: description.input.value.trim(),
      lines: /** @type {ReturnType<typeof lineList>} */ (lines).read(problems),
    };
    problems.push(...changeOrderErrors(input));
    return showProblems(
      allFields(),
      withLineLabels(problems),
      CHANGE_ORDER_LABELS,
    )
      ? null
      : input;
  }

  async function submit() {
    const input = readForm();
    if (!input) return;
    save.disabled = true;
    const name = nameInSentence(input);
    const outcome = await ctx.write(
      (api) =>
        editing
          ? api.patchChangeOrder(order.id, input)
          : api.createChangeOrder(projectId, input),
      { done: editing ? `Saved ${name}` : `Added ${name}` },
    );
    save.disabled = false;
    if (outcome.ok) {
      dialog.close();
      return;
    }
    const { error } = outcome;
    if (error instanceof ApiError && error.field) {
      showProblems(
        allFields(),
        withLineLabels([{ field: error.field, message: error.message }]),
        CHANGE_ORDER_LABELS,
      );
    }
  }

  async function deleteOrder() {
    if (!order) return;
    const yes = await confirmDialog({
      title: `Delete ${nameInSentence(order)}?`,
      message: order.approved
        ? 'The rows it adds to go back to the estimates typed on them.'
        : 'It is pending, so no estimate changes.',
    });
    if (!yes) return;
    await ctx.write((api) => api.deleteChangeOrder(order.id), {
      done: `Deleted ${nameInSentence(order)}`,
    });
  }

  document.body.append(dialog.el);
  dialog.open();
  return dialog;
}
