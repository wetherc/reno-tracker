// The filter bar over every view of the schedule: a search box, a party
// picker, and a status switch. The bar is built once and stays attached
// while the view under it redraws, so the search box keeps its caret as
// a person types. A count line says how many items the filter hides and
// offers Clear, so a saved status never hides work without a word.
import {
  isFiltering,
  NO_FILTER,
  partiesOf,
  readStatus,
  STATUSES,
} from '../schedule/filter.js';
import { button } from '../ui/buttons.js';
import { focusKey } from '../ui/focusKey.js';
import { icon } from '../ui/icon.js';
import { segSwitch } from '../ui/SegSwitch.js';

/** @typedef {import('../storage/prefs.js').Prefs} Prefs */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../schedule/filter.js').ScheduleFilter} ScheduleFilter */
/** @typedef {import('../schedule/filter.js').StatusFilter} StatusFilter */

/** @type {Record<StatusFilter, string>} */
const STATUS_LABELS = { all: 'All', open: 'Open', late: 'Late' };

const ANYONE = 'Anyone';

/**
 * @param {{ prefs: Prefs, onChange: () => void }} deps
 *   onChange runs after each change a person makes
 */
export function mountScheduleFilter({ prefs, onChange }) {
  /** @type {ScheduleFilter} */
  let filter = {
    ...NO_FILTER,
    status: readStatus(prefs.read('scheduleStatus')),
  };

  const el = document.createElement('div');
  el.className = 'schedule-filter';
  el.setAttribute('role', 'search');
  el.setAttribute('aria-label', 'Filter the schedule');

  const search = document.createElement('label');
  search.className = 'schedule-filter__search';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'field';
  input.placeholder = 'Search items';
  input.setAttribute('aria-label', 'Search items');
  focusKey(input, 'filter:text');
  input.addEventListener('input', () => change({ text: input.value }));
  search.append(icon('search'), input);

  const party = document.createElement('select');
  party.className = 'field schedule-filter__party';
  party.setAttribute('aria-label', 'Responsible party');
  focusKey(party, 'filter:party');
  party.addEventListener('change', () => change({ party: party.value }));

  const status = segSwitch({
    label: 'Status',
    options: STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    value: filter.status,
    onChange: (next) => {
      prefs.write('scheduleStatus', next);
      change({ status: next });
    },
  });
  STATUSES.forEach((s, i) => focusKey(status.el.children[i], `filter:${s}`));

  const count = document.createElement('p');
  count.className = 'schedule-filter__count u-muted';
  count.setAttribute('aria-live', 'polite');
  const countText = document.createElement('span');
  const clearButton = button({ label: 'Clear', onClick: () => clear() });
  focusKey(clearButton, 'filter:clear');
  count.append(countText, clearButton);

  el.append(search, party, status.el, count);

  /** @param {Partial<ScheduleFilter>} next */
  function change(next) {
    filter = { ...filter, ...next };
    onChange();
  }

  /** Drops every choice and puts focus in the search box. */
  function clear() {
    input.value = '';
    party.value = '';
    status.set('all', { silent: true });
    prefs.write('scheduleStatus', 'all');
    filter = { ...NO_FILTER };
    onChange();
    input.focus();
  }

  return {
    el,
    get filter() {
      return filter;
    },
    clear,

    /**
     * Drops the text and the party, which name things in one project.
     * The status stays, because it means the same in every project.
     */
    reset() {
      input.value = '';
      filter = { ...filter, text: '', party: '' };
    },

    /**
     * Lists the parties of the items. A picked party that no item names
     * any more falls back to anyone.
     * @param {ScheduleItem[]} items
     */
    update(items) {
      const names = partiesOf(items);
      if (!names.includes(filter.party)) filter = { ...filter, party: '' };
      party.replaceChildren(
        ...['', ...names].map((name) => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.append(name || ANYONE);
          return opt;
        }),
      );
      party.value = filter.party;
    },

    /**
     * @param {number} shown
     * @param {number} total
     */
    setCount(shown, total) {
      const on = isFiltering(filter);
      clearButton.hidden = !on;
      countText.textContent = on ? `${shown} of ${total} items` : '';
    },
  };
}
