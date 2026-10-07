// The materials section: the bill of materials for the open project as a
// table with a totals row, an Add button in the panel header, and a
// checkbox per row that marks the material bought. The name opens the
// editor. Allowance, Estimate, and Actual are raw cost. Estimate adds
// the row's approved change orders. Blended is what the costs panel
// counts for the row, with its margin.
import { addedCents, approvedChanges } from '../costs/changed.js';
import { landingDate, materialExpected } from '../costs/timeline.js';
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { readSort, sortText } from '../storage/prefs.js';
import { bareButton, button } from '../ui/buttons.js';
import { dataTable, tableScroll } from '../ui/DataTable.js';
import { emptyState } from '../ui/emptyState.js';
import { focusKey } from '../ui/focusKey.js';
import { icon } from '../ui/icon.js';
import { estimateCell as amountCell } from './changeEstimates.js';
import { openMaterialEditor } from './materialEditor.js';
import { blendedColumn, projections } from './rowMarkup.js';
import {
  costVariance,
  totalCostVariance,
  varianceCell,
} from './scheduleTable.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

// The Expected column and the costs panel agree on the landing day
// because both read it from one function.
export { landingDate };

/**
 * How far the material runs over its allowance. The actual price counts
 * once it is entered, the expected cost before that.
 * @param {MaterialItem} item
 * @param {number} changeCents the sum of its approved change order lines
 * @returns {number}
 */
export function allowanceVariance(item, changeCents) {
  return (
    (item.actualCents ?? materialExpected(item, changeCents)) -
    item.allowanceCents
  );
}

/**
 * Actual minus expected, or null until an actual is entered.
 * @param {MaterialItem} item
 * @param {number} changeCents the sum of its approved change order lines
 */
export function estimateVariance(item, changeCents) {
  return costVariance({
    estimatedCents: materialExpected(item, changeCents),
    actualCents: item.actualCents,
  });
}

/**
 * Column totals. Estimate sums the expected cost of each row, so a row
 * with no estimate adds its allowance, and each row adds its approved
 * change orders. Actual sums only the rows that have a price entered.
 * @param {MaterialItem[]} materials
 * @param {import('../costs/changed.js').Changes} changes
 */
export function materialTotals(materials, changes) {
  const totals = { allowanceCents: 0, estimatedCents: 0, actualCents: 0 };
  for (const item of materials) {
    totals.allowanceCents += item.allowanceCents;
    totals.estimatedCents += materialExpected(
      item,
      addedCents(changes, item.id),
    );
    totals.actualCents += item.actualCents ?? 0;
  }
  return totals;
}

/**
 * @param {string} a
 * @param {string} b
 */
const byText = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * @param {{ ctx: AppContext, shell: Shell }} deps
 * @returns {{ show(): void }} show fills the panel with the bill of materials
 */
export function mountMaterials({ ctx, shell }) {
  const addButton = button({
    label: 'Add material',
    icon: 'plus',
    variant: 'primary',
    onClick: () => openMaterialEditor({ ctx }),
  });
  focusKey(addButton, 'add-material');

  // The sort a person picked outlives the rebuild after each write, and
  // prefs keep it for the next visit.
  /** @type {import('../ui/DataTable.js').SortState | null} */
  let sort = readSort(ctx.prefs.read('materialsSort'));

  /** @param {ProjectPayload} payload */
  function buildTable(payload) {
    const titles = new Map(payload.schedule.map((s) => [s.id, s.title]));
    /** @param {MaterialItem} item */
    const forTitle = (item) => titles.get(item.scheduleItemId ?? '') ?? '';
    /** @param {MaterialItem} item */
    const lands = (item) => landingDate(item, payload).date;
    const changes = approvedChanges(payload.changeOrders);
    /** @param {MaterialItem} item */
    const added = (item) => addedCents(changes, item.id);
    /** @param {MaterialItem} item */
    const expected = (item) => materialExpected(item, added(item));
    /** @param {MaterialItem} item */
    const overAllowance = (item) => allowanceVariance(item, added(item));
    /** @param {MaterialItem} item */
    const overEstimate = (item) => estimateVariance(item, added(item));
    const totals = materialTotals(payload.materials, changes);
    const overall = payload.materials.reduce(
      (sum, item) => sum + overAllowance(item),
      0,
    );
    const blended = blendedColumn(projections(payload), payload.materials);
    return dataTable({
      caption: `Materials for ${payload.project.name}`,
      rows: payload.materials,
      rowKey: (item) => item.id,
      rowClass: (item) => (item.complete ? 'material-row--complete' : ''),
      sort,
      onSort: (next) => {
        sort = next;
        ctx.prefs.write('materialsSort', sortText(next));
      },
      footer: [
        '',
        'Total',
        '',
        '',
        formatCents(totals.allowanceCents),
        formatCents(totals.estimatedCents),
        formatCents(totals.actualCents),
        varianceCell(
          totalCostVariance(
            payload.materials.map((item) => ({
              estimatedCents: expected(item),
              actualCents: item.actualCents,
            })),
          ),
        ),
        varianceCell(overall),
        blended.footer,
      ],
      columns: [
        {
          key: 'complete',
          label: 'Bought',
          hideLabel: true,
          align: 'center',
          cell: (item) => completeToggle(item),
        },
        {
          key: 'name',
          label: 'Material',
          compare: (a, b) => byText(a.name, b.name),
          cell: (item) =>
            focusKey(
              bareButton({
                className: 'material-name',
                children: item.complete
                  ? [icon('check', { label: 'Bought' }), item.name]
                  : [item.name],
                onClick: () => openMaterialEditor({ ctx, item }),
              }),
              `${item.id}:open`,
            ),
        },
        {
          key: 'for',
          label: 'For',
          compare: (a, b) => byText(forTitle(a), forTitle(b)),
          cell: (item) => forTitle(item) || '—',
        },
        {
          key: 'expected',
          label: 'Expected',
          nowrap: true,
          compare: (a, b) => byText(lands(a), lands(b)),
          cell: (item) => expectedCell(item, payload),
        },
        {
          key: 'allowance',
          label: 'Allowance',
          align: 'end',
          compare: (a, b) => a.allowanceCents - b.allowanceCents,
          cell: (item) => formatCents(item.allowanceCents),
        },
        {
          key: 'estimate',
          label: 'Estimate',
          align: 'end',
          compare: (a, b) => expected(a) - expected(b),
          cell: (item) => estimateCell(item, added(item)),
        },
        {
          key: 'actual',
          label: 'Actual',
          align: 'end',
          compare: (a, b) => (a.actualCents ?? -1) - (b.actualCents ?? -1),
          cell: (item) => formatCents(item.actualCents),
        },
        {
          key: 'vsEstimate',
          label: 'Vs estimate',
          align: 'end',
          compare: (a, b) =>
            (overEstimate(a) ?? -Infinity) - (overEstimate(b) ?? -Infinity),
          cell: (item) => varianceCell(overEstimate(item)),
        },
        {
          key: 'variance',
          label: 'Vs allowance',
          align: 'end',
          compare: (a, b) => overAllowance(a) - overAllowance(b),
          cell: (item) => varianceCell(overAllowance(item)),
        },
        blended.column,
      ],
    });
  }

  /**
   * The expected cost, with the change order part under it. With no
   * estimate the allowance stands in for it.
   * @param {MaterialItem} item
   * @param {number} changeCents
   */
  function estimateCell(item, changeCents) {
    const el = document.createElement('span');
    el.append(amountCell(materialExpected(item, changeCents), changeCents));
    if (item.estimatedCents === 0)
      standIn(el, 'the allowance, no estimate yet');
    return el;
  }

  /** @param {MaterialItem} item @param {ProjectPayload} payload */
  function expectedCell(item, payload) {
    const { date, inferred } = landingDate(item, payload);
    const el = document.createElement('span');
    el.append(formatDayMonth(date));
    if (inferred) {
      standIn(
        el,
        item.scheduleItemId ? 'from the item start' : 'from the project start',
      );
    }
    return el;
  }

  /**
   * Marks a value that stands in for one not entered yet. It shows in
   * muted italics, a screen reader hears the reason after the value, and
   * the note under the table explains the italics.
   * @param {HTMLSpanElement} el
   * @param {string} reason
   */
  function standIn(el, reason) {
    el.className = 'material-standin u-muted';
    const said = document.createElement('span');
    said.className = 'sr-only';
    said.textContent = ` (${reason})`;
    el.append(said);
  }

  /**
   * The sentences under the table for the stand-in values it shows.
   * @param {ProjectPayload} payload
   * @returns {HTMLParagraphElement[]} one note, or nothing with no stand-ins
   */
  function standInNote(payload) {
    const lines = [];
    if (payload.materials.some((m) => m.estimatedCents === 0)) {
      lines.push(
        'An estimate in italics is the allowance, because no estimate is entered yet.',
      );
    }
    if (payload.materials.some((m) => landingDate(m, payload).inferred)) {
      lines.push(
        'A day in italics follows the start of its schedule item, or the project start when the material has no item.',
      );
    }
    if (lines.length === 0) return [];
    const note = document.createElement('p');
    note.className = 'material-note u-muted';
    note.setAttribute('aria-hidden', 'true');
    note.textContent = lines.join(' ');
    return [note];
  }

  /** @param {MaterialItem} item */
  function completeToggle(item) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'check';
    box.checked = item.complete;
    focusKey(box, `${item.id}:complete`);
    box.setAttribute('aria-label', `${item.name} bought`);
    box.addEventListener('change', async () => {
      box.disabled = true;
      const next = box.checked;
      const outcome = await ctx.write(
        (api) => api.setMaterialComplete(item.id, next),
        { done: next ? `Marked ${item.name} bought` : `Unmarked ${item.name}` },
      );
      if (!outcome.ok) {
        box.checked = item.complete;
        box.disabled = false;
      }
    });
    return box;
  }

  function show() {
    const payload = ctx.payload;
    if (!payload) return;
    shell.tools.replaceChildren(addButton);
    if (payload.materials.length === 0) {
      shell.setBody(
        emptyState(`No materials listed for ${payload.project.name} yet.`, {
          action: button({
            label: 'Add the first material',
            icon: 'plus',
            variant: 'primary',
            onClick: () => openMaterialEditor({ ctx }),
          }),
        }),
      );
      return;
    }
    shell.setBody(tableScroll(buildTable(payload).el), ...standInNote(payload));
  }

  return { show };
}
