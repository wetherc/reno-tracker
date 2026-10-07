// The change orders section: every change order of the open project as
// a table with a totals row, and an Add button in the panel header. The
// party opens the editor. Each row names the schedule items and
// materials its lines add to, its status, and its total with the
// markup, and names the markup under the total. The totals row
// sums the approved change orders only, because a pending one adds
// nothing to the estimates, and a note under the table names the
// pending sum.
import { changeOrderTotal } from '../entities/changeOrder.js';
import { docMarkup } from '../entities/lineItems.js';
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { readSort, sortText } from '../storage/prefs.js';
import { bareButton, button } from '../ui/buttons.js';
import { byText, dataTable, tableScroll } from '../ui/DataTable.js';
import { emptyState } from '../ui/emptyState.js';
import { focusKey } from '../ui/focusKey.js';
import { stackedCell } from '../ui/stackedCell.js';
import { openChangeOrderEditor } from './changeOrderEditor.js';
import { lineNames } from './lineList.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @param {ChangeOrder} order
 * @returns {HTMLSpanElement}
 */
export function statusBadge(order) {
  const el = document.createElement('span');
  el.className = order.approved
    ? 'badge badge--success'
    : 'badge badge--neutral';
  el.textContent = order.approved ? 'Approved' : 'Pending';
  return el;
}

/**
 * The total of a change order, with its markup under it when it has
 * some.
 * @param {ChangeOrder} order
 * @returns {Node | string}
 */
export function totalCell(order) {
  const total = formatCents(changeOrderTotal(order));
  const markup = docMarkup(order);
  return markup === 0
    ? total
    : stackedCell(total, `${formatCents(markup)} markup`);
}

/**
 * The sums of the approved and the pending change orders.
 * @param {ChangeOrder[]} orders
 * @returns {{ approvedCents: number, pendingCents: number, pendingCount: number }}
 */
export function changeOrderSums(orders) {
  const sums = { approvedCents: 0, pendingCents: 0, pendingCount: 0 };
  for (const order of orders) {
    const total = changeOrderTotal(order);
    if (order.approved) {
      sums.approvedCents += total;
    } else {
      sums.pendingCents += total;
      sums.pendingCount += 1;
    }
  }
  return sums;
}

/**
 * The note under the table, or nothing when no change order is pending.
 * @param {ReturnType<typeof changeOrderSums>} sums
 * @returns {HTMLParagraphElement[]}
 */
export function pendingNote({ pendingCents, pendingCount }) {
  if (pendingCount === 0) return [];
  const note = document.createElement('p');
  note.className = 'change-orders__note u-muted';
  const what =
    pendingCount === 1
      ? '1 pending change order adds'
      : `${pendingCount} pending change orders add`;
  note.textContent = `${what} ${formatCents(pendingCents)} once approved. The total counts approved change orders only.`;
  return [note];
}

/**
 * @param {{ ctx: AppContext, shell: Shell }} deps
 * @returns {{ show(): void }} show fills the panel with the change orders
 */
export function mountChangeOrders({ ctx, shell }) {
  const addButton = button({
    label: 'Add change order',
    icon: 'plus',
    variant: 'primary',
    onClick: () => openChangeOrderEditor({ ctx }),
  });
  focusKey(addButton, 'add-change-order');

  /** @type {import('../ui/DataTable.js').SortState | null} */
  let sort = readSort(ctx.prefs.read('changeOrdersSort'));

  /**
   * @param {ProjectPayload} payload
   * @param {ReturnType<typeof changeOrderSums>} sums
   */
  function buildTable(payload, sums) {
    /** @param {ChangeOrder} order */
    const adds = (order) => lineNames(order, payload);
    return dataTable({
      caption: `Change orders for ${payload.project.name}`,
      rows: payload.changeOrders,
      rowKey: (order) => order.id,
      sort,
      onSort: (next) => {
        sort = next;
        ctx.prefs.write('changeOrdersSort', sortText(next));
      },
      footer: ['Approved', '', '', '', '', formatCents(sums.approvedCents)],
      columns: [
        {
          key: 'party',
          label: 'From',
          compare: (a, b) => byText(a.party, b.party),
          cell: (order) =>
            focusKey(
              bareButton({
                className: 'doc-party',
                label: order.party,
                onClick: () => openChangeOrderEditor({ ctx, order }),
              }),
              `${order.id}:open`,
            ),
        },
        {
          key: 'number',
          label: 'No.',
          compare: (a, b) =>
            a.number.localeCompare(b.number, 'en', { numeric: true }),
          cell: (order) => order.number || '—',
        },
        {
          key: 'dated',
          label: 'Dated',
          nowrap: true,
          compare: (a, b) => a.issuedDate.localeCompare(b.issuedDate),
          cell: (order) => formatDayMonth(order.issuedDate),
        },
        {
          key: 'adds',
          label: 'Adds to',
          compare: (a, b) => byText(adds(a), adds(b)),
          cell: adds,
        },
        {
          key: 'status',
          label: 'Status',
          nowrap: true,
          compare: (a, b) => Number(a.approved) - Number(b.approved),
          cell: statusBadge,
        },
        {
          key: 'total',
          label: 'Total',
          align: 'end',
          compare: (a, b) => changeOrderTotal(a) - changeOrderTotal(b),
          cell: totalCell,
        },
      ],
    });
  }

  function show() {
    const payload = ctx.payload;
    if (!payload) return;
    const linkable = payload.schedule.length + payload.materials.length > 0;
    addButton.disabled = !linkable;
    shell.tools.replaceChildren(addButton);
    if (!linkable) {
      shell.setBody(
        emptyState(
          `A change order adds to schedule items and materials, and ${payload.project.name} has none yet. Add one under Schedule or Materials first.`,
        ),
      );
      return;
    }
    if (payload.changeOrders.length === 0) {
      shell.setBody(
        emptyState(`No change orders for ${payload.project.name} yet.`, {
          action: button({
            label: 'Add the first change order',
            icon: 'plus',
            variant: 'primary',
            onClick: () => openChangeOrderEditor({ ctx }),
          }),
        }),
      );
      return;
    }
    const sums = changeOrderSums(payload.changeOrders);
    shell.setBody(
      tableScroll(buildTable(payload, sums).el),
      ...pendingNote(sums),
    );
  }

  return { show };
}
