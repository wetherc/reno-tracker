// The materials section: the bill of materials for the open project as a
// table with a totals row, an Add button in the panel header, and a
// checkbox per row that marks the material bought. The name opens the
// editor.
import { landingDate, materialExpected } from '../costs/timeline.js';
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { bareButton, button } from '../ui/buttons.js';
import { dataTable, tableScroll } from '../ui/DataTable.js';
import { emptyState } from '../ui/emptyState.js';
import { icon } from '../ui/icon.js';
import { openMaterialEditor } from './materialEditor.js';
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
 * @returns {number}
 */
export function allowanceVariance(item) {
  return (item.actualCents ?? materialExpected(item)) - item.allowanceCents;
}

/**
 * Actual minus expected, or null until an actual is entered.
 * @param {MaterialItem} item
 */
export function estimateVariance(item) {
  return costVariance({
    estimatedCents: materialExpected(item),
    actualCents: item.actualCents,
  });
}

/**
 * Column totals. Estimate sums the expected cost of each row, so a row
 * with no estimate adds its allowance. Actual sums only the rows that
 * have a price entered.
 * @param {MaterialItem[]} materials
 */
export function materialTotals(materials) {
  const totals = { allowanceCents: 0, estimatedCents: 0, actualCents: 0 };
  for (const item of materials) {
    totals.allowanceCents += item.allowanceCents;
    totals.estimatedCents += materialExpected(item);
    totals.actualCents += item.actualCents ?? 0;
  }
  return totals;
}

/** @param {MaterialItem} item */
const expectedRow = (item) => ({
  estimatedCents: materialExpected(item),
  actualCents: item.actualCents,
});

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

  // The sort a person picked outlives the rebuild after each write.
  /** @type {import('../ui/DataTable.js').SortState | null} */
  let sort = null;

  /** @param {ProjectPayload} payload */
  function buildTable(payload) {
    const titles = new Map(payload.schedule.map((s) => [s.id, s.title]));
    /** @param {MaterialItem} item */
    const forTitle = (item) => titles.get(item.scheduleItemId ?? '') ?? '';
    /** @param {MaterialItem} item */
    const lands = (item) => landingDate(item, payload).date;
    const totals = materialTotals(payload.materials);
    const overall = payload.materials.reduce(
      (sum, item) => sum + allowanceVariance(item),
      0,
    );
    return dataTable({
      caption: `Materials for ${payload.project.name}`,
      rows: payload.materials,
      rowKey: (item) => item.id,
      rowClass: (item) => (item.complete ? 'material-row--complete' : ''),
      sort,
      onSort: (next) => (sort = next),
      footer: [
        '',
        'Total',
        '',
        '',
        formatCents(totals.allowanceCents),
        formatCents(totals.estimatedCents),
        formatCents(totals.actualCents),
        varianceCell(totalCostVariance(payload.materials.map(expectedRow))),
        varianceCell(overall),
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
            bareButton({
              className: 'material-name',
              children: item.complete
                ? [icon('check', { label: 'Bought' }), item.name]
                : [item.name],
              onClick: () => openMaterialEditor({ ctx, item }),
            }),
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
          compare: (a, b) => materialExpected(a) - materialExpected(b),
          cell: (item) => estimateCell(item),
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
            (estimateVariance(a) ?? -Infinity) -
            (estimateVariance(b) ?? -Infinity),
          cell: (item) => varianceCell(estimateVariance(item)),
        },
        {
          key: 'variance',
          label: 'Vs allowance',
          align: 'end',
          compare: (a, b) => allowanceVariance(a) - allowanceVariance(b),
          cell: (item) => varianceCell(allowanceVariance(item)),
        },
      ],
    });
  }

  /** @param {MaterialItem} item */
  function estimateCell(item) {
    const el = document.createElement('span');
    el.append(formatCents(materialExpected(item)));
    if (item.estimatedCents === 0) {
      el.className = 'u-muted';
      el.title = 'No estimate yet, so the allowance stands in';
    }
    return el;
  }

  /** @param {MaterialItem} item @param {ProjectPayload} payload */
  function expectedCell(item, payload) {
    const { date, inferred } = landingDate(item, payload);
    const el = document.createElement('span');
    el.append(formatDayMonth(date));
    if (inferred) {
      el.className = 'u-muted';
      el.title = item.scheduleItemId
        ? 'Follows the start of the schedule item it is for'
        : 'Follows the project start';
    }
    return el;
  }

  /** @param {MaterialItem} item */
  function completeToggle(item) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'check';
    box.checked = item.complete;
    box.setAttribute(
      'aria-label',
      item.complete ? `Unmark ${item.name}` : `Mark ${item.name} bought`,
    );
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
    shell.setBody(tableScroll(buildTable(payload).el));
  }

  return { show };
}
