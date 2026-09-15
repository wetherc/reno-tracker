// The editor for one schedule item. A new item gets the form alone. An
// existing item gets tabs: the form, the items it waits on, its notes,
// and its change log. An edit asks for a reason, and the server writes
// that reason onto every variance row the save produces.
import { ApiError } from '../api/errors.js';
import { validateScheduleItem } from '../entities/scheduleItem.js';
import { todayIso } from '../schedule/dates.js';
import { button } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import {
  dateField,
  form,
  moneyField,
  textArea,
  textField,
} from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';
import { tabs } from '../ui/Tabs.js';
import { dependencyLinks } from './dependencies.js';
import { notesList } from './notesList.js';
import { FIELD_LABELS, varianceList } from './varianceList.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ScheduleItemInput} ScheduleItemInput */
/** @typedef {'details' | 'links' | 'notes' | 'changes'} EditorTab */

let counter = 0;

/**
 * @param {{ ctx: AppContext, item?: ScheduleItem, tab?: EditorTab }} config
 * @returns {import('../ui/Modal.js').ModalHandle}
 */
export function openScheduleEditor({ ctx, item, tab = 'details' }) {
  const prefix = `item-${++counter}`;
  const editing = item !== undefined;
  const projectId = ctx.payload?.project.id ?? item?.projectId ?? '';

  const title = textField({
    id: `${prefix}-title`,
    label: FIELD_LABELS.title,
    value: item?.title ?? '',
    placeholder: 'Demo the kitchen',
    required: true,
    wide: true,
  });
  title.input.setAttribute('autofocus', '');
  const responsibleParty = textField({
    id: `${prefix}-party`,
    label: FIELD_LABELS.responsibleParty,
    value: item?.responsibleParty ?? '',
    placeholder: 'Contractor, plumber, us',
  });
  const startDate = dateField({
    id: `${prefix}-start`,
    label: FIELD_LABELS.startDate,
    value: item?.startDate ?? ctx.payload?.project.startDate ?? todayIso(),
    required: true,
  });
  const endDate = dateField({
    id: `${prefix}-end`,
    label: FIELD_LABELS.endDate,
    value: item?.endDate ?? startDate.input.value,
    required: true,
  });
  const estimatedCents = moneyField({
    id: `${prefix}-estimate`,
    label: FIELD_LABELS.estimatedCents,
    cents: item?.estimatedCents ?? 0,
  });
  const actualCents = moneyField({
    id: `${prefix}-actual`,
    label: FIELD_LABELS.actualCents,
    cents: item?.actualCents ?? null,
    placeholder: 'Blank until billed',
    blankIsNull: true,
  });
  const description = textArea({
    id: `${prefix}-description`,
    label: FIELD_LABELS.description,
    value: item?.description ?? '',
    placeholder: 'Scope, materials on site, anything the party needs to know.',
  });
  const reason = textField({
    id: `${prefix}-reason`,
    label: 'Why the change?',
    placeholder: 'Kept with each change in the log. Optional.',
    wide: true,
  });
  reason.el.classList.add('editor__reason');
  const fields = {
    title,
    responsibleParty,
    startDate,
    endDate,
    estimatedCents,
    actualCents,
    description,
    reason,
  };
  /** @typedef {keyof typeof fields} FieldName */

  const formEl = form({
    ariaLabel: editing ? 'Edit schedule item' : 'New schedule item',
    onSubmit: submit,
  });
  formEl.id = `${prefix}-form`;
  formEl.append(
    title.el,
    responsibleParty.el,
    startDate.el,
    endDate.el,
    estimatedCents.el,
    actualCents.el,
    description.el,
  );
  if (editing) formEl.append(reason.el);

  const save = button({
    label: editing ? 'Save' : 'Add to schedule',
    variant: 'primary',
    type: 'submit',
  });
  save.setAttribute('form', formEl.id);
  const actions = [
    button({ label: 'Cancel', onClick: () => dialog.close() }),
    save,
  ];

  /** @type {ReturnType<typeof notesList> | null} */
  let notes = null;
  /** @type {ReturnType<typeof dependencyLinks> | null} */
  let links = null;
  const changes = document.createElement('div');
  /** @type {(Node | string)[]} */
  let body = [formEl];

  if (editing) {
    links = dependencyLinks({ ctx, item });
    notes = notesList({
      ctx,
      itemId: item.id,
      notes: ctx.payload?.notes ?? [],
    });
    renderChanges();
    const details = document.createElement('div');
    details.append(formEl);
    body = [
      tabs({
        id: prefix,
        selected: tab,
        items: [
          { id: 'details', label: 'Details', panel: details },
          { id: 'links', label: 'Waits on', panel: links.el },
          { id: 'notes', label: 'Notes', panel: notes.el },
          { id: 'changes', label: 'Changes', panel: changes },
        ],
      }).el,
    ];
    const remove = button({
      label: 'Delete',
      variant: 'danger',
      icon: 'trash',
      onClick: deleteItem,
    });
    remove.classList.add('editor__delete');
    actions.unshift(remove);
  }

  const dialog = modal({
    title: editing ? item.title : 'New schedule item',
    body,
    actions,
    wide: editing,
    onClose: () => {
      unsubscribe();
      dialog.el.remove();
    },
  });

  // While the editor is open, every write refetches the project. The
  // notes and changes tabs follow the new payload. If the item is gone,
  // the editor closes.
  const unsubscribe = ctx.on('payload', (payload) => {
    if (!editing) return;
    if (!payload || !payload.schedule.some((s) => s.id === item.id)) {
      dialog.close();
      return;
    }
    notes?.update(payload.notes);
    links?.update(payload);
    renderChanges();
  });

  function renderChanges() {
    const all = ctx.payload?.variances ?? [];
    changes.replaceChildren(
      varianceList(all.filter((v) => v.scheduleItemId === item?.id)),
    );
  }

  /** @param {FieldName} field @param {string | null} message */
  function mark(field, message) {
    fields[field].setError(message);
  }

  /** @returns {Required<ScheduleItemInput> | null} */
  function readForm() {
    for (const name of /** @type {FieldName[]} */ (Object.keys(fields))) {
      mark(name, null);
    }
    const estimate = estimatedCents.cents();
    const actual = actualCents.cents();
    let bad = false;
    if (estimate === null) {
      mark(
        'estimatedCents',
        'Estimate must be dollars and cents, like 1,250.00',
      );
      bad = true;
    }
    if (actual === null && actualCents.input.value.trim() !== '') {
      mark('actualCents', 'Actual must be dollars and cents, or blank');
      bad = true;
    }
    if (bad) return null;
    const input = {
      title: title.input.value.trim(),
      description: description.input.value.trim(),
      startDate: startDate.input.value,
      endDate: endDate.input.value,
      responsibleParty: responsibleParty.input.value.trim(),
      estimatedCents: /** @type {number} */ (estimate),
      actualCents: actual,
    };
    const problem = validateScheduleItem(input);
    if (problem) {
      mark(/** @type {FieldName} */ (problem.field), problem.message);
      return null;
    }
    return input;
  }

  async function submit() {
    const input = readForm();
    if (!input) return;
    save.disabled = true;
    const outcome = await ctx.write(
      (api) =>
        editing
          ? api.patchScheduleItem(item.id, {
              ...input,
              reason: reason.input.value.trim(),
            })
          : api.createScheduleItem(projectId, input),
      { done: editing ? `Saved ${input.title}` : `Added ${input.title}` },
    );
    save.disabled = false;
    if (outcome.ok) {
      dialog.close();
      return;
    }
    const { error } = outcome;
    if (error instanceof ApiError && error.field && error.field in fields) {
      mark(/** @type {FieldName} */ (error.field), error.message);
    }
  }

  async function deleteItem() {
    if (!item) return;
    const yes = await confirmDialog({
      title: `Delete ${item.title}?`,
      message:
        'Its notes, change log, and dependency links go with it. Materials linked to it stay and lose the link.',
    });
    if (!yes) return;
    await ctx.write((api) => api.deleteScheduleItem(item.id), {
      done: `Deleted ${item.title}`,
    });
  }

  document.body.append(dialog.el);
  dialog.open();
  return dialog;
}
