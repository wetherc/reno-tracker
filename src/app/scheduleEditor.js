// The editor for one schedule item. A new item gets the form alone. An
// existing item gets tabs: the form, the items it waits on, its notes,
// and its change log. An edit asks for a reason, and the server writes
// that reason onto every variance row the save produces.
import { ApiError } from '../api/errors.js';
import { scheduleItemErrors } from '../entities/scheduleItem.js';
import { spanDays, todayIso } from '../schedule/dates.js';
import { button } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import { keepFocus } from '../ui/focusKey.js';
import {
  dateField,
  form,
  moneyField,
  textArea,
  textField,
} from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';
import { tabs } from '../ui/Tabs.js';
import { actualField, refuseLinked } from './billing.js';
import { addChangeHint, changesOf } from './changeEstimates.js';
import { completeToggle } from './completeToggle.js';
import { dependencyLinks } from './dependencies.js';
import { discardGuard } from './discardGuard.js';
import { MARKUP_MESSAGE } from './projectDialog.js';
import { isBlank, markupRateField, projectionLine } from './rowMarkup.js';
import { showProblems } from './formErrors.js';
import { notesList } from './notesList.js';
import { changesPanel, FIELD_LABELS } from './varianceList.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ScheduleItemInput} ScheduleItemInput */
/** @typedef {'details' | 'links' | 'notes' | 'changes'} EditorTab */

let counter = 0;

/**
 * The words under the end date for the span the two dates make.
 * @param {string} start
 * @param {string} end
 * @returns {string}
 */
export function describeLength(start, end) {
  if (end < start) return 'Ends before it starts';
  const days = spanDays(start, end);
  return days === 1 ? '1 day' : `${days} days`;
}

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
    wide: true,
  });
  const startDate = dateField({
    id: `${prefix}-start`,
    label: FIELD_LABELS.startDate,
    value: item?.startDate ?? ctx.payload?.project.startDate ?? todayIso(),
    required: true,
    onInput: () => showLength(),
  });
  const endDate = dateField({
    id: `${prefix}-end`,
    label: FIELD_LABELS.endDate,
    value: item?.endDate ?? startDate.input.value,
    required: true,
    onInput: () => showLength(),
  });
  const length = document.createElement('p');
  length.className = 'form__hint';
  endDate.el.append(length);
  showLength();
  const estimatedCents = moneyField({
    id: `${prefix}-estimate`,
    label: FIELD_LABELS.estimatedCents,
    cents: item?.estimatedCents ?? 0,
  });
  const change = item && changesOf(ctx).get(item.id);
  addChangeHint(estimatedCents, change);
  const actual = actualField({
    ctx,
    id: `${prefix}-actual`,
    label: FIELD_LABELS.actualCents,
    rowId: item?.id,
    cents: item?.actualCents ?? null,
    placeholder: 'Blank until billed',
  });
  const actualCents = actual.field;
  const projectRate = ctx.payload?.project.markupBasisPoints ?? 0;
  const markupBasisPoints = markupRateField({
    id: `${prefix}-markup`,
    label: `${FIELD_LABELS.markupBasisPoints} (%)`,
    basisPoints: item?.markupBasisPoints ?? null,
    projectRate,
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
    ...(!actual.billed && { actualCents }),
    markupBasisPoints,
    description,
    reason,
  };

  const projection = projectionLine(() => {
    const expected = estimatedCents.cents();
    const rate = markupBasisPoints.basisPoints();
    const typed = actualCents.cents();
    if (expected === null) return null;
    if (rate === null && !isBlank(markupBasisPoints)) return null;
    if (typed === null && !isBlank(actualCents)) return null;
    // The Complete box saves at once, so the live item in the payload
    // has the current value and the item from open time may not.
    const live = ctx.payload?.schedule.find((s) => s.id === item?.id);
    return {
      complete: (live ?? item)?.complete ?? false,
      expected,
      change,
      actualCents: typed,
      markupBasisPoints: rate,
      projectRate,
      billing: actual.billing,
    };
  });

  const formEl = form({
    ariaLabel: editing ? 'Edit schedule item' : 'New schedule item',
    onSubmit: submit,
  });
  formEl.id = `${prefix}-form`;
  formEl.classList.add('form--pairs');
  formEl.append(
    title.el,
    responsibleParty.el,
    startDate.el,
    endDate.el,
    estimatedCents.el,
    actualCents.el,
    markupBasisPoints.el,
    projection.el,
    description.el,
  );
  if (editing) formEl.append(reason.el);
  formEl.addEventListener('input', projection.update);

  const save = button({
    label: editing ? 'Save' : 'Add to schedule',
    variant: 'primary',
    type: 'submit',
  });
  save.setAttribute('form', formEl.id);
  const cancel = button({
    label: 'Cancel',
    onClick: () => dialog.requestClose(),
  });
  const actions = [cancel, save];
  // Save and Cancel belong to the form, so the other tabs hide them.
  /** @param {string} id */
  const showFormActions = (id) => {
    save.hidden = id !== 'details';
    cancel.hidden = id !== 'details';
  };
  showFormActions(tab);

  /** @type {ReturnType<typeof notesList> | null} */
  let notes = null;
  /** @type {ReturnType<typeof dependencyLinks> | null} */
  let links = null;
  /** @type {ReturnType<typeof changesPanel> | null} */
  let changes = null;
  /** @type {ReturnType<typeof tabs> | null} */
  let tabStrip = null;
  /** @type {(Node | string)[]} */
  let body = [formEl];

  // The complete checkbox writes at once, like the one in the table, so
  // Calendar and Gantt reach it through the editor. The box is rebuilt
  // from each new payload so its label and rollback state match the
  // saved item.
  const completeBox = document.createElement('label');
  completeBox.className = 'editor__complete';

  if (editing) {
    const completeText = document.createElement('span');
    completeText.textContent = 'Complete';
    completeBox.append(completeToggle({ ctx, item }), completeText);
    links = dependencyLinks({ ctx, item });
    notes = notesList({
      ctx,
      itemId: item.id,
      notes: ctx.payload?.notes ?? [],
    });
    changes = changesPanel({ ctx, itemId: item.id });
    if (tab === 'changes') changes.load();
    const details = document.createElement('div');
    details.append(completeBox, formEl);
    tabStrip = tabs({
      id: prefix,
      selected: tab,
      onChange: (id) => {
        showFormActions(id);
        if (id === 'changes') changes?.load();
      },
      items: [
        { id: 'details', label: 'Details', panel: details },
        { id: 'links', label: 'Waits on', panel: links.el },
        { id: 'notes', label: 'Notes', panel: notes.el },
        { id: 'changes', label: 'Changes', panel: changes.el },
      ],
    });
    body = [tabStrip.el];
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
    beforeClose: discardGuard(fields, () => notes?.dirty() ?? false),
    onClose: () => {
      unsubscribe();
      dialog.el.remove();
    },
  });

  // While the editor is open, every write refetches the project. The
  // notes tab follows the new payload, and the changes tab loads again
  // when it is open. If the item is gone, the editor closes.
  const unsubscribe = ctx.on('payload', (payload) => {
    if (!editing) return;
    if (!payload || !payload.schedule.some((s) => s.id === item.id)) {
      dialog.close();
      return;
    }
    notes?.update(payload.notes);
    links?.update(payload);
    if (tabStrip?.current === 'changes') changes?.load();
    projection.update();
    const fresh = payload.schedule.find((s) => s.id === item.id);
    if (fresh)
      keepFocus(
        () =>
          completeBox.firstChild?.replaceWith(
            completeToggle({ ctx, item: fresh }),
          ),
        dialog.el,
      );
  });

  // The length under the end date follows both dates as they are typed.
  function showLength() {
    const start = startDate.input.value;
    const end = endDate.input.value;
    length.textContent = start && end ? describeLength(start, end) : '';
  }

  /** @returns {ScheduleItemInput | null} */
  function readForm() {
    const estimate = estimatedCents.cents();
    const typed = actualCents.cents();
    const rate = markupBasisPoints.basisPoints();
    /** @type {import('../entities/validate.js').FieldError[]} */
    const problems = [];
    if (estimate === null) {
      problems.push({
        field: 'estimatedCents',
        message: 'Raw estimate must be dollars and cents, like 1,250.00',
      });
    }
    if (typed === null && actualCents.input.value.trim() !== '') {
      problems.push({
        field: 'actualCents',
        message: 'Raw actual must be dollars and cents, or blank',
      });
    }
    if (rate === null && !isBlank(markupBasisPoints)) {
      problems.push({ field: 'markupBasisPoints', message: MARKUP_MESSAGE });
    }
    const input = {
      title: title.input.value.trim(),
      description: description.input.value.trim(),
      startDate: startDate.input.value,
      endDate: endDate.input.value,
      responsibleParty: responsibleParty.input.value.trim(),
      estimatedCents: estimate ?? 0,
      actualCents: typed,
      markupBasisPoints: rate,
    };
    // A money field that does not parse keeps its own message.
    problems.push(...scheduleItemErrors(input));
    if (showProblems(fields, problems, FIELD_LABELS)) return null;
    /** @type {ScheduleItemInput} */
    const body = input;
    if (!actual.sends()) delete body.actualCents;
    return body;
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
    if (error instanceof ApiError && error.field) {
      showProblems(
        fields,
        [{ field: error.field, message: error.message }],
        FIELD_LABELS,
      );
    }
  }

  async function deleteItem() {
    if (!item || refuseLinked(ctx, item.id, item.title)) return;
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
