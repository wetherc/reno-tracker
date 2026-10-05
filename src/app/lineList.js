// The line list of the invoice and change order editors. Each line picks
// the schedule item or material it names, an amount, and an optional
// note. The last line cannot be removed, and Add line stops at the most
// lines a document takes.
import { MAX_LINES } from '../entities/lineItems.js';
import { formatCents } from '../format/money.js';
import { formatPercent } from '../format/percent.js';
import { button, iconButton } from '../ui/buttons.js';
import { moneyField, selectField, textField } from '../ui/formFields.js';

/** @typedef {import('../types.ts').LineItemInput} LineItemInput */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */
/** @typedef {import('../entities/validate.js').FieldError} FieldError */

export const LINE_LABELS = {
  amountCents: 'Amount',
  description: 'Note',
};

/** The choice a new line starts on, which names nothing yet. */
export const NO_ROW = '';

/**
 * The select value for the row a line names: "schedule:<id>" or
 * "material:<id>".
 * @param {Pick<LineItemInput, 'scheduleItemId' | 'materialItemId'>} line
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
 * @returns {Pick<LineItemInput, 'scheduleItemId' | 'materialItemId'>}
 */
export function readRow(value) {
  const [kind, ...rest] = value.split(':');
  const id = rest.join(':');
  return {
    scheduleItemId: kind === 'schedule' ? id : null,
    materialItemId: kind === 'material' ? id : null,
  };
}

/**
 * The names of the rows a document's lines name, once each, in line
 * order.
 * @param {{ lines: Pick<LineItemInput, 'scheduleItemId' | 'materialItemId'>[] }} doc
 * @param {ProjectPayload} payload
 * @returns {string}
 */
export function lineNames(doc, payload) {
  /** @type {Map<string, string>} */
  const names = new Map([
    ...payload.schedule.map((s) => /** @type {const} */ ([s.id, s.title])),
    ...payload.materials.map((m) => /** @type {const} */ ([m.id, m.name])),
  ]);
  const seen = new Set(
    doc.lines.map(
      (l) =>
        names.get(
          /** @type {string} */ (l.scheduleItemId ?? l.materialItemId),
        ) ?? '',
    ),
  );
  return [...seen].join(', ');
}

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
 * @typedef {{
 *   el: HTMLDivElement,
 *   title: HTMLHeadingElement,
 *   row: FieldHandle,
 *   amount: ReturnType<typeof moneyField>,
 *   note: FieldHandle,
 *   remove: HTMLButtonElement,
 * }} LineEditor
 */

/**
 * @param {{
 *   prefix: string,
 *   payload: ProjectPayload,
 *   lines: LineItemInput[] | undefined,
 *   rowLabel: string,
 *   onChange: () => void,
 * }} config lines are the stored lines, or undefined for one blank line; rowLabel names the select, such as "Bills"
 */
export function lineList({
  prefix,
  payload,
  lines: start,
  rowLabel,
  onChange,
}) {
  const schedule = [...payload.schedule].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const materials = [...payload.materials].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  /** @type {LineEditor[]} */
  const lines = [];
  const list = document.createElement('div');
  list.className = 'line-list__items';
  const addLine = button({
    label: 'Add line',
    icon: 'plus',
    onClick: () => {
      const line = lineEditor({ amountCents: 0 });
      line.row.input.focus();
    },
  });

  /** @param {HTMLSelectElement} select */
  function addChoices(select) {
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
      select.append(group);
    }
  }

  /**
   * @param {LineItemInput} value
   * @returns {LineEditor}
   */
  function lineEditor(value) {
    const n = ++counter;
    const el = document.createElement('div');
    el.className = 'line-item';
    const title = document.createElement('h3');
    title.className = 'line-item__title section-label';
    const row = selectField({
      id: `${prefix}-line-${n}-row`,
      label: rowLabel,
      value: NO_ROW,
      options: [{ value: NO_ROW, label: 'Pick an item or a material' }],
    });
    row.el.classList.add('line-item__row');
    addChoices(/** @type {HTMLSelectElement} */ (row.input));
    row.input.value = rowValue(value);
    const amount = moneyField({
      id: `${prefix}-line-${n}-amount`,
      label: LINE_LABELS.amountCents,
      cents: value.amountCents,
      onInput: onChange,
    });
    const note = textField({
      id: `${prefix}-line-${n}-note`,
      label: LINE_LABELS.description,
      value: value.description ?? '',
      placeholder: 'Optional',
    });
    note.el.classList.add('line-item__note');
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
    remove.classList.add('line-item__remove');
    el.append(title, remove, row.el, amount.el, note.el);
    /** @type {LineEditor} */
    const line = { el, title, row, amount, note, remove };
    lines.push(line);
    list.append(el);
    renumber();
    return line;
  }

  function renumber() {
    lines.forEach((line, i) => {
      line.title.textContent = `Line ${i + 1}`;
      line.remove.setAttribute('aria-label', `Remove line ${i + 1}`);
      line.remove.title = `Remove line ${i + 1}`;
      line.remove.disabled = lines.length === 1;
    });
    addLine.disabled = lines.length >= MAX_LINES;
    onChange();
  }

  for (const line of start ?? [{ amountCents: 0 }]) lineEditor(line);

  return {
    /**
     * The fieldset with its legend, the lines, and a footer that starts
     * with Add line and goes on with the given parts.
     * @param {...HTMLElement} parts
     * @returns {HTMLFieldSetElement}
     */
    fieldset(...parts) {
      const set = document.createElement('fieldset');
      set.className = 'line-list form__wide';
      const legend = document.createElement('legend');
      legend.className = 'card__title';
      legend.textContent = 'Lines';
      const footer = document.createElement('div');
      footer.className = 'line-list__footer';
      footer.append(addLine, ...parts);
      set.append(legend, list, footer);
      return set;
    },
    /** @returns {{ amountCents: number }[]} the amounts as typed, with junk read as zero */
    amounts: () => lines.map((l) => ({ amountCents: l.amount.cents() ?? 0 })),
    /** @returns {Record<string, FieldHandle>} every field by its error name, in form order */
    fields() {
      /** @type {Record<string, FieldHandle>} */
      const fields = {};
      lines.forEach((line, i) => {
        fields[`lines.${i}.item`] = line.row;
        fields[`lines.${i}.amountCents`] = line.amount;
        fields[`lines.${i}.description`] = line.note;
      });
      return fields;
    },
    /**
     * The lines as typed. An amount that does not parse adds a problem
     * and reads as zero.
     * @param {FieldError[]} problems
     * @returns {LineItemInput[]}
     */
    read(problems) {
      return lines.map((line, i) => {
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
      });
    },
    /** @returns {string} the lines as typed, for the discard guard */
    text: () =>
      JSON.stringify(
        lines.map((l) => [
          l.row.input.value,
          l.amount.input.value,
          l.note.input.value,
        ]),
      ),
  };
}
