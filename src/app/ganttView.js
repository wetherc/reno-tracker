// The gantt view: one row per item in date order with a predecessor above
// its successors, bars on a day grid that scrolls sideways, and a
// connector from each predecessor to its successor. The item names stay
// fixed on the left while the grid scrolls. A bar moves by drag or by
// arrow key and the change is saved at once, so the change log records
// it like any other edit.
import { formatDayMonth } from '../format/date.js';
import { todayIso } from '../schedule/dates.js';
import { ganttLayout } from '../schedule/gantt.js';
import { bareButton } from '../ui/buttons.js';
import { completeToggle } from './completeToggle.js';
import { ganttBar, moveMessage } from './ganttBar.js';
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
 * @returns {{ render(payload: ProjectPayload): HTMLElement }}
 */
export function ganttView({ ctx }) {
  // The scroll position and the focused handle are kept across the
  // rebuild that follows every save, so a keyboard user can press an
  // arrow key many times in a row.
  /** @type {number | null} */
  let scrollLeft = null;
  /** @type {string | null} */
  let pendingFocus = null;

  /** @param {ProjectPayload} payload */
  function render(payload) {
    const layout = ganttLayout({
      items: payload.schedule,
      dependencies: payload.dependencies,
      today: todayIso(),
      dayWidth: DAY_WIDTH,
      rowHeight: ROW_HEIGHT,
    });
    const byId = new Map(payload.schedule.map((item) => [item.id, item]));

    const root = document.createElement('div');
    root.className = 'gantt';
    root.style.setProperty('--gantt-day', `${layout.dayWidth}px`);
    root.style.setProperty('--gantt-row', `${layout.rowHeight}px`);
    root.addEventListener('scroll', () => {
      scrollLeft = root.scrollLeft;
    });

    const status = document.createElement('p');
    status.className = 'gantt__status';
    status.setAttribute('aria-live', 'polite');

    const corner = document.createElement('div');
    corner.className = 'gantt__corner';
    corner.append(status);
    const names = document.createElement('div');
    names.className = 'gantt__names';
    names.append(...layout.rows.map((row) => label(row.item)));
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
          row,
          dayWidth: layout.dayWidth,
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
      const today = document.createElement('div');
      today.className = 'gantt__today';
      today.style.left = `${layout.todayX}px`;
      today.setAttribute('aria-hidden', 'true');
      chart.append(today);
    }

    root.append(side, chart);
    queueMicrotask(() => {
      root.scrollLeft =
        scrollLeft ?? Math.max(0, (layout.todayX ?? 0) - layout.dayWidth * 7);
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
   */
  async function move(item, patch, edge) {
    pendingFocus = `${item.id}:${edge}`;
    await ctx.write((api) => api.patchScheduleItem(item.id, patch), {
      done: moveMessage(item, patch),
    });
  }

  /** @param {ScheduleItem} item */
  function label(item) {
    const el = document.createElement('div');
    el.className = item.complete
      ? 'gantt__label gantt__label--complete'
      : 'gantt__label';
    const name = bareButton({
      className: 'gantt__name',
      label: item.title,
      onClick: () => openScheduleEditor({ ctx, item }),
    });
    const head = document.createElement('div');
    head.className = 'gantt__head';
    head.append(completeToggle({ ctx, item }), name);
    el.append(head);
    if (item.responsibleParty) {
      const party = document.createElement('span');
      party.className = 'gantt__party u-muted';
      party.textContent = item.responsibleParty;
      el.append(party);
    }
    return el;
  }

  return { render };
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
