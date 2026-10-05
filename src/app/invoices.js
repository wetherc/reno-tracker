// The invoices section: tiles with what is still owed and when, then
// every invoice of the open project as a table with a totals row, and
// an Add button in the panel header. The party opens the editor. Each
// row names the schedule items and materials its lines bill, what it
// still owes, and where it stands.
import { balance, owedSummary } from '../costs/owed.js';
import { invoiceTotal } from '../entities/invoice.js';
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { todayIso } from '../schedule/dates.js';
import { readSort, sortText } from '../storage/prefs.js';
import { bareButton, button } from '../ui/buttons.js';
import { dataTable, tableScroll } from '../ui/DataTable.js';
import { emptyState } from '../ui/emptyState.js';
import { focusKey } from '../ui/focusKey.js';
import { openInvoiceEditor } from './invoiceEditor.js';
import { lineNames } from './lineList.js';
import {
  owedCell,
  payButton,
  renderOwed,
  statusBadge,
  statusText,
} from './invoiceOwed.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @param {string} a
 * @param {string} b
 */
const byText = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * @param {{ ctx: AppContext, shell: Shell }} deps
 * @returns {{ show(): void }} show fills the panel with the invoices
 */
export function mountInvoices({ ctx, shell }) {
  const addButton = button({
    label: 'Add invoice',
    icon: 'plus',
    variant: 'primary',
    onClick: () => openInvoiceEditor({ ctx }),
  });
  focusKey(addButton, 'add-invoice');

  /** @type {import('../ui/DataTable.js').SortState | null} */
  let sort = readSort(ctx.prefs.read('invoicesSort'));

  /**
   * @param {ProjectPayload} payload
   * @param {string} today
   */
  function buildTable(payload, today) {
    /** @param {Invoice} invoice */
    const bills = (invoice) => lineNames(invoice, payload);
    /** @param {Invoice} invoice */
    const owed = (invoice) => balance(invoice).owedCents;
    const sum = payload.invoices.reduce((s, i) => s + invoiceTotal(i), 0);
    const owedSum = payload.invoices.reduce((s, i) => s + owed(i), 0);
    return dataTable({
      caption: `Invoices for ${payload.project.name}`,
      rows: payload.invoices,
      rowKey: (invoice) => invoice.id,
      sort,
      onSort: (next) => {
        sort = next;
        ctx.prefs.write('invoicesSort', sortText(next));
      },
      footer: [
        'Total',
        '',
        '',
        '',
        '',
        formatCents(sum),
        formatCents(owedSum),
        '',
        '',
      ],
      columns: [
        {
          key: 'party',
          label: 'From',
          compare: (a, b) => byText(a.party, b.party),
          cell: (invoice) =>
            focusKey(
              bareButton({
                className: 'invoice-party',
                label: invoice.party,
                onClick: () => openInvoiceEditor({ ctx, invoice }),
              }),
              `${invoice.id}:open`,
            ),
        },
        {
          key: 'number',
          label: 'Invoice no.',
          compare: (a, b) =>
            a.number.localeCompare(b.number, 'en', { numeric: true }),
          cell: (invoice) => invoice.number || '—',
        },
        {
          key: 'issued',
          label: 'Issued',
          nowrap: true,
          compare: (a, b) => a.issuedDate.localeCompare(b.issuedDate),
          cell: (invoice) => formatDayMonth(invoice.issuedDate),
        },
        {
          key: 'due',
          label: 'Due',
          nowrap: true,
          compare: (a, b) =>
            (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
          cell: (invoice) =>
            invoice.dueDate ? formatDayMonth(invoice.dueDate) : '—',
        },
        {
          key: 'bills',
          label: 'Bills',
          compare: (a, b) => byText(bills(a), bills(b)),
          cell: bills,
        },
        {
          key: 'total',
          label: 'Total',
          align: 'end',
          compare: (a, b) => invoiceTotal(a) - invoiceTotal(b),
          cell: (invoice) => formatCents(invoiceTotal(invoice)),
        },
        {
          key: 'owed',
          label: 'Owed',
          align: 'end',
          compare: (a, b) => owed(a) - owed(b),
          cell: owedCell,
        },
        {
          key: 'status',
          label: 'Status',
          nowrap: true,
          compare: (a, b) => byText(statusText(a, today), statusText(b, today)),
          cell: (invoice) => statusBadge(invoice, today),
        },
        {
          key: 'pay',
          label: 'Payment',
          hideLabel: true,
          cell: (invoice) => payButton(ctx, invoice),
        },
      ],
    });
  }

  function show() {
    const payload = ctx.payload;
    if (!payload) return;
    const billable = payload.schedule.length + payload.materials.length > 0;
    addButton.disabled = !billable;
    shell.tools.replaceChildren(addButton);
    if (!billable) {
      shell.setBody(
        emptyState(
          `An invoice bills schedule items and materials, and ${payload.project.name} has none yet. Add one under Schedule or Materials first.`,
        ),
      );
      return;
    }
    if (payload.invoices.length === 0) {
      shell.setBody(
        emptyState(`No invoices for ${payload.project.name} yet.`, {
          action: button({
            label: 'Add the first invoice',
            icon: 'plus',
            variant: 'primary',
            onClick: () => openInvoiceEditor({ ctx }),
          }),
        }),
      );
      return;
    }
    const today = todayIso();
    shell.setBody(
      renderOwed(owedSummary(payload.invoices, today)),
      tableScroll(buildTable(payload, today).el),
    );
  }

  return { show };
}
