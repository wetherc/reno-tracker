// The editor for one invoice. The number, the party, and the two days
// sit at the top. Under them, each line picks the schedule item or
// material it bills, an amount, and an optional note. A running total
// follows the amounts as they are typed. The payments and the retainage
// come last.
import { ApiError } from '../api/errors.js';
import {
  invoiceErrors,
  invoiceName,
  invoiceNameInSentence as nameInSentence,
  MAX_LINES,
} from '../entities/invoice.js';
import { formatCents } from '../format/money.js';
import { button, iconButton } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import {
  dateField,
  form,
  moneyField,
  selectField,
  textField,
} from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';
import { todayIso } from '../schedule/dates.js';
import { discardGuard } from './discardGuard.js';
import { PAYMENT_LABELS, paymentList } from './paymentList.js';
import { showProblems } from './formErrors.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').InvoiceInput} InvoiceInput */
/** @typedef {import('../types.ts').InvoiceLineInput} InvoiceLineInput */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */

export const INVOICE_LABELS = {
  number: 'Invoice no.',
  party: 'From',
  issuedDate: 'Issued',
  dueDate: 'Due',
  amountCents: 'Amount',
  description: 'Note',
  ...PAYMENT_LABELS,
};

/** The choice a new line starts on, which bills nothing yet. */
export const NO_ROW = '';

/**
 * The select value for the row a line bills: "schedule:<id>" or
 * "material:<id>".
 * @param {Pick<InvoiceLineInput, 'scheduleItemId' | 'materialItemId'>} line
 * @returns {string}
 */
export function rowValue(line) {
  if (line.scheduleItemId) return `schedule:${line.scheduleItemId}`;
  if (line.materialItemId) return `material:${line.materialItemId}`;
  return NO_ROW;
}

/**
 * The links a select value stands for.
 * @param {string} value
 * @returns {Pick<InvoiceLineInput, 'scheduleItemId' | 'materialItemId'>}
 */
export function readRow(value) {
  const [kind, ...rest] = value.split(':');
  const id = rest.join(':');
  return {
    scheduleItemId: kind === 'schedule' ? id : null,
    materialItemId: kind === 'material' ? id : null,
  };
}

let counter = 0;

/**
 * @param {{ ctx: AppContext, invoice?: Invoice }} config
 * @returns {import('../ui/Modal.js').ModalHandle}
 */
export function openInvoiceEditor({ ctx, invoice }) {
  const prefix = `invoice-${++counter}`;
  const editing = invoice !== undefined;
  const payload = /** @type {ProjectPayload} */ (ctx.payload);
  const projectId = payload.project.id;
  const schedule = [...payload.schedule].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const materials = [...payload.materials].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const number = textField({
    id: `${prefix}-number`,
    label: INVOICE_LABELS.number,
    value: invoice?.number ?? '',
    placeholder: 'Optional',
  });
  const party = textField({
    id: `${prefix}-party`,
    label: INVOICE_LABELS.party,
    value: invoice?.party ?? '',
    placeholder: 'Pinch Plumbing',
    required: true,
  });
  party.input.setAttribute('autofocus', '');
  const issuedDate = dateField({
    id: `${prefix}-issued`,
    label: INVOICE_LABELS.issuedDate,
    value: invoice?.issuedDate ?? todayIso(),
    required: true,
  });
  const dueDate = dateField({
    id: `${prefix}-due`,
    label: INVOICE_LABELS.dueDate,
    value: invoice?.dueDate ?? '',
  });
  const head = { number, party, issuedDate, dueDate };

  /**
   * @typedef {{
   *   el: HTMLDivElement,
   *   title: HTMLHeadingElement,
   *   row: FieldHandle,
   *   amount: ReturnType<typeof moneyField>,
   *   note: FieldHandle,
   *   remove: HTMLButtonElement,
   * }} LineEditor
   */
  /** @type {LineEditor[]} */
  const lines = [];
  const list = document.createElement('div');
  list.className = 'invoice-lines__list';
  const total = document.createElement('p');
  total.className = 'invoice-lines__total';
  total.setAttribute('aria-live', 'polite');
  const addLine = button({
    label: 'Add line',
    icon: 'plus',
    onClick: () => {
      const line = lineEditor({ amountCents: 0 });
      line.row.input.focus();
    },
  });

  /**
   * @param {InvoiceLineInput} value
   * @returns {LineEditor}
   */
  function lineEditor(value) {
    const n = ++counter;
    const el = document.createElement('div');
    el.className = 'invoice-line';
    const title = document.createElement('h3');
    title.className = 'invoice-line__title section-label';
    const row = selectField({
      id: `${prefix}-line-${n}-row`,
      label: 'Bills',
      value: NO_ROW,
      options: [{ value: NO_ROW, label: 'Pick an item or a material' }],
    });
    row.el.classList.add('invoice-line__row');
    for (const [label, choices] of /** @type {const} */ ([
      ['Schedule', schedule.map((s) => [`schedule:${s.id}`, s.title])],
      ['Materials', materials.map((m) => [`material:${m.id}`, m.name])],
    ])) {
      if (choices.length === 0) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const [v, text] of choices) {
        const option = document.createElement('option');
        option.value = v;
        option.append(text);
        group.append(option);
      }
      row.input.append(group);
    }
    row.input.value = rowValue(value);
    const amount = moneyField({
      id: `${prefix}-line-${n}-amount`,
      label: INVOICE_LABELS.amountCents,
      cents: value.amountCents,
      onInput: showTotal,
    });
    const note = textField({
      id: `${prefix}-line-${n}-note`,
      label: INVOICE_LABELS.description,
      value: value.description ?? '',
      placeholder: 'Optional',
    });
    note.el.classList.add('invoice-line__note');
    const remove = iconButton({
      icon: 'trash',
      label: 'Remove line',
      onClick: () => {
        lines.splice(lines.indexOf(line), 1);
        el.remove();
        renumber();
        addLine.focus();
      },
    });
    remove.classList.add('invoice-line__remove');
    el.append(title, remove, row.el, amount.el, note.el);
    /** @type {LineEditor} */
    const line = { el, title, row, amount, note, remove };
    lines.push(line);
    list.append(el);
    renumber();
    return line;
  }

  // Each line names its place, the last line cannot be removed, and Add
  // line stops at the most lines an invoice takes.
  function renumber() {
    lines.forEach((line, i) => {
      line.title.textContent = `Line ${i + 1}`;
      line.remove.setAttribute('aria-label', `Remove line ${i + 1}`);
      line.remove.title = `Remove line ${i + 1}`;
      line.remove.disabled = lines.length === 1;
    });
    addLine.disabled = lines.length >= MAX_LINES;
    showTotal();
  }

  const linesTotal = () =>
    lines.reduce((sum, l) => sum + (l.amount.cents() ?? 0), 0);

  function showTotal() {
    total.textContent = `Total ${formatCents(linesTotal())}`;
    payments.update();
  }

  const payments = paymentList({ prefix, invoice, total: linesTotal });

  for (const line of invoice?.lines ?? [{ amountCents: 0 }]) lineEditor(line);

  const linesSet = document.createElement('fieldset');
  linesSet.className = 'invoice-lines form__wide';
  const legend = document.createElement('legend');
  legend.className = 'card__title';
  legend.textContent = 'Lines';
  const footer = document.createElement('div');
  footer.className = 'invoice-lines__footer';
  footer.append(addLine, total);
  linesSet.append(legend, list, footer);

  const formEl = form({
    ariaLabel: editing ? 'Edit invoice' : 'New invoice',
    onSubmit: submit,
  });
  formEl.id = `${prefix}-form`;
  formEl.classList.add('form--pairs');
  formEl.append(
    number.el,
    party.el,
    issuedDate.el,
    dueDate.el,
    linesSet,
    payments.el,
  );

  const lineText = () =>
    JSON.stringify(
      lines.map((l) => [
        l.row.input.value,
        l.amount.input.value,
        l.note.input.value,
      ]),
    );
  const initialLines = lineText();
  const initialPayments = payments.text();

  const save = button({
    label: editing ? 'Save' : 'Add invoice',
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
      onClick: deleteInvoice,
    });
    remove.classList.add('editor__delete');
    actions.unshift(remove);
  }

  const dialog = modal({
    title: editing ? invoiceName(invoice) : 'New invoice',
    body: [formEl],
    actions,
    wide: true,
    beforeClose: discardGuard(
      head,
      () => lineText() !== initialLines || payments.text() !== initialPayments,
    ),
    onClose: () => {
      unsubscribe();
      dialog.el.remove();
    },
  });

  // A write elsewhere refetches the project. If this invoice is gone,
  // the editor closes.
  const unsubscribe = ctx.on('payload', (next) => {
    if (!editing) return;
    if (!next || !next.invoices.some((i) => i.id === invoice.id)) {
      dialog.close();
    }
  });

  /** @returns {Record<string, FieldHandle>} every field in form order */
  function allFields() {
    /** @type {Record<string, FieldHandle>} */
    const fields = { ...head };
    lines.forEach((line, i) => {
      fields[`lines.${i}.item`] = line.row;
      fields[`lines.${i}.amountCents`] = line.amount;
      fields[`lines.${i}.description`] = line.note;
    });
    return { ...fields, ...payments.fields() };
  }

  /** @returns {Required<InvoiceInput> | null} */
  function readForm() {
    /** @type {import('../entities/validate.js').FieldError[]} */
    const problems = [];
    const input = {
      number: number.input.value.trim(),
      party: party.input.value.trim(),
      issuedDate: issuedDate.input.value,
      dueDate: dueDate.input.value || null,
      markupBasisPoints:
        invoice?.markupBasisPoints ?? payload.project.markupBasisPoints,
      lines: lines.map((line, i) => {
        const cents = line.amount.cents();
        if (cents === null) {
          problems.push({
            field: `lines.${i}.amountCents`,
            message: `Line ${i + 1}: Amount must be dollars and cents, like 1,250.00`,
          });
        }
        return {
          ...readRow(line.row.input.value),
          amountCents: cents ?? 0,
          description: line.note.input.value.trim(),
        };
      }),
      ...payments.read(problems),
    };
    problems.push(...invoiceErrors(input));
    return showProblems(allFields(), problems, INVOICE_LABELS) ? null : input;
  }

  async function submit() {
    const input = readForm();
    if (!input) return;
    save.disabled = true;
    const name = nameInSentence(input);
    const outcome = await ctx.write(
      (api) =>
        editing
          ? api.patchInvoice(invoice.id, input)
          : api.createInvoice(projectId, input),
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
        [{ field: error.field, message: error.message }],
        INVOICE_LABELS,
      );
    }
  }

  async function deleteInvoice() {
    if (!invoice) return;
    const yes = await confirmDialog({
      title: `Delete ${nameInSentence(invoice)}?`,
      message:
        'The rows it bills go back to the actual price typed on them, if any.',
    });
    if (!yes) return;
    await ctx.write((api) => api.deleteInvoice(invoice.id), {
      done: `Deleted ${nameInSentence(invoice)}`,
    });
  }

  document.body.append(dialog.el);
  dialog.open();
  return dialog;
}
