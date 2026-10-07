// The read-only view of each saved record. A click on a saved invoice,
// change order, schedule item, or material opens its view, and the Edit
// button in the view opens the editor. A new record opens the editor at
// once.
import { changeOrderName, changeOrderTotal } from '../entities/changeOrder.js';
import { invoiceName, invoiceTotal } from '../entities/invoice.js';
import { docMarkup, lineRate, lineSubtotal } from '../entities/lineItems.js';
import { balance } from '../costs/owed.js';
import { formatDate, formatRange } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { formatPercent } from '../format/percent.js';
import { todayIso } from '../schedule/dates.js';
import { button } from '../ui/buttons.js';
import { factList, openRecordView } from '../ui/recordView.js';
import { sectionLabel } from '../ui/sectionLabel.js';
import { openChangeOrderEditor } from './changeOrderEditor.js';
import { openInvoiceEditor } from './invoiceEditor.js';
import { statusBadge } from './invoiceOwed.js';
import { openMaterialEditor } from './materialEditor.js';
import { projections, projectionText } from './rowMarkup.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../types.ts').LineItem} LineItem */
/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */

/**
 * @param {AppContext} ctx
 * @returns {(redraw: () => void) => () => void}
 */
const onPayload = (ctx) => (redraw) => ctx.on('payload', redraw);

/**
 * @template {{ id: string }} T
 * @param {AppContext} ctx
 * @param {(payload: ProjectPayload) => T[]} list
 * @param {string} id
 * @returns {() => T | null}
 */
const finder = (ctx, list, id) => () =>
  (ctx.payload && list(ctx.payload).find((r) => r.id === id)) || null;

/**
 * @param {string[]} heads
 * @param {(Node | string)[][]} rows
 * @param {(Node | string)[][]} [foot]
 * @returns {HTMLTableElement}
 */
export function simpleTable(heads, rows, foot = []) {
  const table = document.createElement('table');
  table.className = 'data-table record-view__table';
  /**
   * @param {HTMLTableSectionElement} section
   * @param {(Node | string)[][]} cells
   * @param {'td' | 'th'} tag
   */
  const fill = (section, cells, tag) => {
    for (const values of cells) {
      const tr = document.createElement('tr');
      values.forEach((value, i) => {
        const cell = document.createElement(i === 0 ? 'th' : tag);
        if (i === 0 && tag === 'td') cell.setAttribute('scope', 'row');
        if (i > 0) cell.className = 'data-table__num';
        cell.append(value);
        tr.append(cell);
      });
      section.append(tr);
    }
  };
  /** @param {'thead' | 'tbody' | 'tfoot'} tag */
  const section = (tag) => {
    const el = document.createElement(tag);
    table.append(el);
    return el;
  };
  const head = section('thead');
  fill(head, [heads], 'th');
  for (const th of head.querySelectorAll('th')) th.setAttribute('scope', 'col');
  fill(section('tbody'), rows, 'td');
  if (foot.length > 0) fill(section('tfoot'), foot, 'td');
  return table;
}

/**
 * The name of the row a line bills or adds to.
 * @param {ProjectPayload} payload
 * @param {LineItem} line
 */
function lineTarget(payload, line) {
  const item = payload.schedule.find((s) => s.id === line.scheduleItemId);
  const material = payload.materials.find((m) => m.id === line.materialItemId);
  const name = item?.title ?? material?.name ?? 'Unknown row';
  return line.description ? `${name}: ${line.description}` : name;
}

/**
 * The lines of an invoice or change order, then subtotal, markup, and
 * total under them.
 * @param {ProjectPayload} payload
 * @param {Invoice | ChangeOrder} doc
 * @param {string} noun 'invoice' or 'change order'
 * @param {number} total
 */
function lineTable(payload, doc, noun, total) {
  const rows = doc.lines.map((line) => [
    lineTarget(payload, line),
    formatCents(line.amountCents),
    line.markupBasisPoints === null
      ? `${formatPercent(lineRate(line, doc))} (${noun} rate)`
      : formatPercent(line.markupBasisPoints),
  ]);
  return simpleTable(['Line', 'Raw amount', 'Markup'], rows, [
    ['Subtotal', formatCents(lineSubtotal(doc)), ''],
    ['Markup', formatCents(docMarkup(doc)), ''],
    ['Total', formatCents(total), ''],
  ]);
}

/**
 * @param {{ ctx: AppContext, invoice: Invoice }} config
 */
export function openInvoiceView({ ctx, invoice }) {
  return openRecordView({
    title: (/** @type {Invoice} */ r) => invoiceName(r),
    find: finder(ctx, (p) => p.invoices, invoice.id),
    subscribe: onPayload(ctx),
    onEdit: (current) => openInvoiceEditor({ ctx, invoice: current }),
    render: (current) => {
      const payload = /** @type {ProjectPayload} */ (ctx.payload);
      const b = balance(current);
      const nodes = [
        factList([
          ['Party', current.party],
          ['Issued', formatDate(current.issuedDate)],
          ['Due', current.dueDate ? formatDate(current.dueDate) : 'No due day'],
          ['Markup rate', formatPercent(current.markupBasisPoints)],
          ['Status', statusBadge(current, todayIso())],
        ]),
        sectionLabel('Lines'),
        lineTable(payload, current, 'invoice', invoiceTotal(current)),
        sectionLabel('Payments'),
      ];
      nodes.push(
        current.payments.length === 0
          ? factList([['Payments', 'None yet']])
          : simpleTable(
              ['Paid', 'Amount', 'Note'],
              current.payments.map((p) => [
                formatDate(p.paidDate),
                formatCents(p.amountCents),
                p.note,
              ]),
            ),
        factList([
          ['Paid', formatCents(b.paidCents)],
          ['Retainage', formatCents(current.retainageCents)],
          ['Open balance', formatCents(b.owedCents)],
          ...(b.creditCents > 0
            ? /** @type {[string, string][]} */ ([
                ['Overpaid', formatCents(b.creditCents)],
              ])
            : []),
        ]),
      );
      return nodes;
    },
  });
}

/**
 * @param {{ ctx: AppContext, order: ChangeOrder }} config
 */
export function openChangeOrderView({ ctx, order }) {
  return openRecordView({
    title: (/** @type {ChangeOrder} */ r) => changeOrderName(r),
    find: finder(ctx, (p) => p.changeOrders, order.id),
    subscribe: onPayload(ctx),
    onEdit: (current) => openChangeOrderEditor({ ctx, order: current }),
    render: (current) => {
      const payload = /** @type {ProjectPayload} */ (ctx.payload);
      const status = document.createElement('span');
      status.className = current.approved
        ? 'badge badge--success'
        : 'badge badge--neutral';
      status.textContent = current.approved ? 'Approved' : 'Pending';
      return [
        factList([
          ['Party', current.party],
          ['Issued', formatDate(current.issuedDate)],
          ['Status', status],
          ['Markup rate', formatPercent(current.markupBasisPoints)],
          ['Reason', current.description || 'None given'],
        ]),
        sectionLabel('Lines'),
        lineTable(payload, current, 'change order', changeOrderTotal(current)),
      ];
    },
  });
}

/**
 * The row rate, or the project rate when the row has none.
 * @param {number | null} own
 * @param {ProjectPayload} payload
 */
const rateText = (own, payload) =>
  own === null
    ? `${formatPercent(payload.project.markupBasisPoints)} (project rate)`
    : formatPercent(own);

/** @param {number | null} cents */
const moneyOrNone = (cents) =>
  cents === null ? 'Not yet' : formatCents(cents);

/**
 * @param {{ ctx: AppContext, item: MaterialItem }} config
 */
export function openMaterialView({ ctx, item }) {
  return openRecordView({
    title: (m) => m.name,
    find: finder(ctx, (p) => p.materials, item.id),
    subscribe: onPayload(ctx),
    onEdit: (current) => openMaterialEditor({ ctx, item: current }),
    render: (current) => {
      const payload = /** @type {ProjectPayload} */ (ctx.payload);
      const linked = payload.schedule.find(
        (s) => s.id === current.scheduleItemId,
      );
      const projection = projections(payload).get(current.id);
      return [
        factList([
          ['For', linked?.title ?? 'No schedule item'],
          [
            'Expected',
            current.expectedDate
              ? formatDate(current.expectedDate)
              : 'No day set',
          ],
          ['Raw allowance', formatCents(current.allowanceCents)],
          ['Raw estimate', moneyOrNone(current.estimatedCents)],
          ['Raw actual', moneyOrNone(current.actualCents)],
          ['Markup rate', rateText(current.markupBasisPoints, payload)],
          ['Bought', current.complete ? 'Yes' : 'No'],
        ]),
        ...(projection ? [blendedLine(projection)] : []),
      ];
    },
  });
}

/** @param {{ cents: number, markupCents: number }} projection */
function blendedLine(projection) {
  const p = document.createElement('p');
  p.className = 'record-view__note';
  p.textContent = projectionText(projection);
  return p;
}

/**
 * @param {{ ctx: AppContext, item: ScheduleItem }} config
 */
export function openScheduleView({ ctx, item }) {
  return openRecordView({
    title: (s) => s.title,
    find: finder(ctx, (p) => p.schedule, item.id),
    subscribe: onPayload(ctx),
    onEdit: (current) => openScheduleEditor({ ctx, item: current }),
    actions: (current, close) =>
      /** @type {const} */ ([
        ['notes', 'Notes'],
        ['changes', 'Changes'],
      ]).map(([tab, label]) =>
        button({
          label,
          onClick: () => {
            close();
            openScheduleEditor({ ctx, item: current, tab });
          },
        }),
      ),
    render: (current) => {
      const payload = /** @type {ProjectPayload} */ (ctx.payload);
      const title = (/** @type {string} */ id) =>
        payload.schedule.find((s) => s.id === id)?.title ?? 'Unknown item';
      const waitsOn = payload.dependencies
        .filter((d) => d.successorId === current.id)
        .map((d) => title(d.predecessorId));
      const blocks = payload.dependencies
        .filter((d) => d.predecessorId === current.id)
        .map((d) => title(d.successorId));
      const notes = payload.notes.filter(
        (n) => n.scheduleItemId === current.id,
      ).length;
      const projection = projections(payload).get(current.id);
      return [
        ...(current.description ? [paragraph(current.description)] : []),
        factList([
          ['Dates', formatRange(current.startDate, current.endDate)],
          ['Responsible', current.responsibleParty || 'No one named'],
          ['Raw estimate', formatCents(current.estimatedCents)],
          ['Raw actual', moneyOrNone(current.actualCents)],
          ['Markup rate', rateText(current.markupBasisPoints, payload)],
          ['Complete', current.complete ? 'Yes' : 'No'],
          ['Waits on', waitsOn.join(', ') || 'Nothing'],
          ['Comes before', blocks.join(', ') || 'Nothing'],
          ['Notes', notes === 1 ? '1 note' : `${notes} notes`],
        ]),
        ...(projection ? [blendedLine(projection)] : []),
      ];
    },
  });
}

/** @param {string} text */
function paragraph(text) {
  const p = document.createElement('p');
  p.className = 'record-view__description';
  p.textContent = text;
  return p;
}
