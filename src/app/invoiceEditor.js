// The editor for one invoice. The number, the party, and the two days
// sit at the top. Under them, each line picks the schedule item or
// material it bills, an amount, and an optional note. The markup rate
// starts at the project rate. A running total follows the amounts and
// the rate as they are typed. The payments and the retainage come last.
import { ApiError } from '../api/errors.js';
import {
  invoiceErrors,
  invoiceName,
  invoiceNameInSentence as nameInSentence,
  invoiceMarkup,
  invoiceSubtotal,
} from '../entities/invoice.js';
import { formatCents } from '../format/money.js';
import { formatPercent } from '../format/percent.js';
import { button } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import { dateField, form, percentField, textField } from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';
import { todayIso } from '../schedule/dates.js';
import { discardGuard } from './discardGuard.js';
import { LINE_LABELS, lineList } from './lineList.js';
import { PAYMENT_LABELS, paymentList } from './paymentList.js';
import { showProblems } from './formErrors.js';
import { MARKUP_MESSAGE } from './projectDialog.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').InvoiceInput} InvoiceInput */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */

export const INVOICE_LABELS = {
  number: 'Invoice no.',
  party: 'From',
  issuedDate: 'Issued',
  dueDate: 'Due',
  markupBasisPoints: 'Markup',
  ...LINE_LABELS,
  ...PAYMENT_LABELS,
};

/**
 * The running total under the lines. With no markup it names the total
 * only.
 * @param {{ subtotalCents: number, markupCents: number, markupBasisPoints: number }} sums
 * @returns {string}
 */
export function totalText({ subtotalCents, markupCents, markupBasisPoints }) {
  const total = `Total ${formatCents(subtotalCents + markupCents)}`;
  if (markupBasisPoints === 0) return total;
  return `Lines ${formatCents(subtotalCents)} + ${formatPercent(markupBasisPoints)} markup ${formatCents(markupCents)} = ${total.toLowerCase()}`;
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
  const markup = percentField({
    id: `${prefix}-markup`,
    label: 'Markup (%)',
    basisPoints:
      invoice?.markupBasisPoints ?? payload.project.markupBasisPoints,
    onInput: () => showTotal(),
  });
  markup.el.classList.add('invoice-markup');

  const total = document.createElement('p');
  total.className = 'line-list__total';
  total.setAttribute('aria-live', 'polite');

  /** @type {ReturnType<typeof lineList> | undefined} */
  let lines;

  /** The lines and rate as typed, with junk read as zero. */
  const typed = () => ({
    markupBasisPoints: markup.basisPoints() ?? 0,
    lines: lines?.amounts() ?? [],
  });
  const linesTotal = () => {
    const bill = typed();
    return invoiceSubtotal(bill) + invoiceMarkup(bill);
  };

  // The line list calls this as it builds its first lines, before the
  // payments exist.
  function showTotal() {
    if (!lines) return;
    const bill = typed();
    total.textContent = totalText({
      subtotalCents: invoiceSubtotal(bill),
      markupCents: invoiceMarkup(bill),
      markupBasisPoints: bill.markupBasisPoints,
    });
    payments.update();
  }

  const payments = paymentList({ prefix, invoice, total: linesTotal });
  lines = lineList({
    prefix,
    payload,
    lines: invoice?.lines,
    rowLabel: 'Bills',
    onChange: showTotal,
  });
  showTotal();
  const linesSet = lines.fieldset(markup.el, total);

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

  const initialLines = lines.text();
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
      { ...head, markup },
      () =>
        lines?.text() !== initialLines || payments.text() !== initialPayments,
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
    const fields = { ...head, ...lines?.fields() };
    fields.markupBasisPoints = markup;
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
      markupBasisPoints: markup.basisPoints() ?? 0,
      lines: /** @type {ReturnType<typeof lineList>} */ (lines).read(problems),
      ...payments.read(problems),
    };
    if (markup.basisPoints() === null) {
      problems.push({ field: 'markupBasisPoints', message: MARKUP_MESSAGE });
    }
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
