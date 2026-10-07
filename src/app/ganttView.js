// The gantt view: one row per item in date order with a predecessor above
// its successors, bars on a day grid that scrolls sideways, and a
// connector from each predecessor to its successor. The item names stay
// fixed on the left while the grid scrolls. A bar moves by drag or by
// arrow key and the change is saved through the same patch as the
// editor, so the change log records it like any other edit. A late item
// gets the Late badge beside its name and a late bar.
import { formatDayMonth } from '../format/date.js';
import { isLate } from '../entities/scheduleItem.js';
import { dayOffset, todayIso } from '../schedule/dates.js';
import { ganttLayout } from '../schedule/gantt.js';
import { bareButton } from '../ui/buttons.js';
import { focusKey } from '../ui/focusKey.js';
import { completeToggle } from './completeToggle.js';
import { fitLabels, ganttBar, moveMessage } from './ganttBar.js';
import { lateBadge } from './lateBadge.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../schedule/gantt.js').GanttLayout} GanttLayout */
/** @typedef {import('../schedule/gantt.js').GanttConnector} GanttConnector */
/** @typedef {import('../schedule/gantt.js').DragEdge} DragEdge */

const SVG = 'http://www.w3.org/2000/svg';
export const DAY_WIDTH = 28;
export const ROW_HEIGHT = 40;

/**
 * @param {{ ctx: AppContext }} deps
 * @returns {{ render(payload: ProjectPayload): HTMLElement, reset(): void }}
 */
export function ganttView({ ctx }) {
  // The scroll position and the focused handle are kept across the
  // rebuild that follows every save, so a keyboard user can press an
  // arrow key many times in a row. The scroll is kept as pixels past the
  // first day of the chart it was read on, so a new first day after a
  // save or a filter change still shows the same dates.
  /** @type {{ start: string, px: number } | null} */
  let scroll = null;
  /** @type {string | null} */
  let pendingFocus = null;

  /** @param {ProjectPayload} payload */
  function render(payload) {
    const today = todayIso();
    const layout = ganttLayout({
      items: payload.schedule,
      dependencies: payload.dependencies,
      today,
      dayWidth: DAY_WIDTH,
      rowHeight: ROW_HEIGHT,
    });
    const byId = new Map(payload.schedule.map((item) => [item.id, item]));

    const root = document.createElement('div');
    root.className = 'gantt';
    root.style.setProperty('--gantt-day', `${layout.dayWidth}px`);
    root.style.setProperty('--gantt-row', `${layout.rowHeight}px`);
    root.addEventListener('scroll', () => {
      scroll = { start: layout.start, px: root.scrollLeft };
    });

    const status = document.createElement('p');
    status.className = 'gantt__status';
    status.setAttribute('aria-live', 'polite');

    const corner = document.createElement('div');
    corner.className = 'gantt__corner';
    corner.append(status);
    const names = document.createElement('div');
    names.className = 'gantt__names';
    names.append(...layout.rows.map((row) => label(row.item, today)));
    const side = document.createElement('div');
    side.className = 'gantt__labels';
    side.append(corner, names);

    const rows = document.createElement('div');
    rows.className = 'gantt__rows';
    rows.style.height = `${layout.height}px`;
    rows.append(links(layout, byId));
    for (const row of layout.rows) {
      rows.append(
        ganttBar({
          item: row.item,
          late: isLate(row.item, today),
          row,
          dayWidth: layout.dayWidth,
          chartWidth: layout.width,
          onOpen: (item) => openScheduleEditor({ ctx, item }),
          onMove: move,
          onPreview: (text) => {
            status.textContent = text ?? '';
          },
        }),
      );
    }

    const chart = document.createElement('div');
    chart.className = 'gantt__chart';
    chart.style.width = `${layout.width}px`;
    chart.append(scale(layout), rows);
    if (layout.todayX !== null) {
      const line = document.createElement('div');
      line.className = 'gantt__today';
      line.style.left = `${layout.todayX}px`;
      line.setAttribute('aria-hidden', 'true');
      chart.append(line);
    }

    root.append(side, chart);
    queueMicrotask(() => {
      fitLabels(
        /** @type {NodeListOf<HTMLElement>} */ (
          rows.querySelectorAll('.gantt-bar')
        ),
        layout.width,
      );
      root.scrollLeft = scroll
        ? scroll.px + dayOffset(layout.start, scroll.start) * layout.dayWidth
        : Math.max(0, (layout.todayX ?? 0) - layout.dayWidth * 7);
      if (pendingFocus) {
        /** @type {HTMLElement | null} */ (
          root.querySelector(`[data-focus="${pendingFocus}"]`)
        )?.focus();
        pendingFocus = null;
      }
    });
    return root;
  }

  /**
   * @param {ScheduleItem} item
   * @param {{ startDate?: string, endDate?: string }} patch
   * @param {DragEdge} edge
   * @param {boolean} refocus
   * @returns {Promise<boolean>} true when the move saved
   */
  async function move(item, patch, edge, refocus) {
    pendingFocus = refocus ? `${item.id}:${edge}` : null;
    const outcome = await ctx.write(
      (api) => api.patchScheduleItem(item.id, patch),
      { done: moveMessage(item, patch) },
    );
    if (!outcome.ok) pendingFocus = null;
    return outcome.ok;
  }

  /** @param {ScheduleItem} item @param {string} today */
  function label(item, today) {
    const el = document.createElement('div');
    const late = lateBadge(item, today);
    el.className = item.complete
      ? 'gantt__label gantt__label--complete'
      : late.length
        ? 'gantt__label gantt__label--late'
        : 'gantt__label';
    const name = bareButton({
      className: 'gantt__name',
      label: item.title,
      onClick: () => openScheduleEditor({ ctx, item }),
    });
    focusKey(name, `${item.id}:open`);
    const head = document.createElement('div');
    head.className = 'gantt__head';
    head.append(completeToggle({ ctx, item }), name, ...late);
    el.append(head);
    if (item.responsibleParty) {
      const party = document.createElement('span');
      party.className = 'gantt__party u-muted';
      party.textContent = item.responsibleParty;
      el.append(party);
    }
    return el;
  }

  return {
    render,
    reset() {
      scroll = null;
    },
  };
}

/**
 * The two header rows: months across the top, the first day of each
 * week under them.
 * @param {GanttLayout} layout
 */
function scale(layout) {
  const el = document.createElement('div');
  el.className = 'gantt__scale';
  el.setAttribute('aria-hidden', 'true');
  const months = document.createElement('div');
  months.className = 'gantt__months';
  for (const month of layout.months) {
    const span = document.createElement('span');
    span.className = 'gantt__month';
    span.style.left = `${month.x}px`;
    span.style.width = `${month.width}px`;
    span.textContent = month.label;
    months.append(span);
  }
  const weeks = document.createElement('div');
  weeks.className = 'gantt__weeks';
  for (const week of layout.weeks) {
    const span = document.createElement('span');
    span.className = 'gantt__week';
    span.style.left = `${week.x}px`;
    span.textContent = formatDayMonth(week.date);
    weeks.append(span);
  }
  el.append(months, weeks);
  return el;
}

/**
 * The dependency connectors as one SVG laid over the rows. A connector
 * whose successor starts too early is drawn in the danger colour and
 * says so in its title.
 * @param {GanttLayout} layout
 * @param {Map<string, ScheduleItem>} byId
 */
function links(layout, byId) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'gantt__links');
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('focusable', 'false');
  svg.append(defs());
  for (const connector of layout.connectors) {
    svg.append(link(connector, byId));
  }
  return svg;
}

function defs() {
  const defs = document.createElementNS(SVG, 'defs');
  for (const kind of ['', 'conflict']) {
    const marker = document.createElementNS(SVG, 'marker');
    marker.setAttribute('id', kind ? `gantt-arrow-${kind}` : 'gantt-arrow');
    marker.setAttribute(
      'class',
      kind ? `gantt__arrow gantt__arrow--${kind}` : 'gantt__arrow',
    );
    marker.setAttribute('viewBox', '0 0 8 8');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('orient', 'auto');
    const head = document.createElementNS(SVG, 'path');
    head.setAttribute('d', 'M0 0L8 4L0 8z');
    marker.append(head);
    defs.append(marker);
  }
  return defs;
}

/**
 * @param {GanttConnector} connector
 * @param {Map<string, ScheduleItem>} byId
 */
function link(connector, byId) {
  const { dependency, d, conflict } = connector;
  const from = byId.get(dependency.predecessorId)?.title ?? '';
  const to = byId.get(dependency.successorId)?.title ?? '';
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute(
    'class',
    conflict ? 'gantt__link gantt__link--conflict' : 'gantt__link',
  );
  path.setAttribute('d', d);
  path.setAttribute(
    'marker-end',
    conflict ? 'url(#gantt-arrow-conflict)' : 'url(#gantt-arrow)',
  );
  const title = document.createElementNS(SVG, 'title');
  title.textContent = conflict
    ? `${to} waits on ${from} but starts before it ends`
    : `${to} waits on ${from}`;
  path.append(title);
  return path;
}
