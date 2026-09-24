// The editor for one material. Name, the schedule item it is for, the
// day it is expected, and three prices: the allowance the budget set
// aside, the estimate, and the actual price once bought.
import { ApiError } from '../api/errors.js';
import { materialItemErrors } from '../entities/materialItem.js';
import { button } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import {
  dateField,
  form,
  moneyField,
  selectField,
  textField,
} from '../ui/formFields.js';
import { modal } from '../ui/Modal.js';
import { discardGuard } from './discardGuard.js';
import { showProblems } from './formErrors.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').MaterialItemInput} MaterialItemInput */

export const MATERIAL_LABELS = {
  name: 'Material',
  scheduleItemId: 'For',
  expectedDate: 'Expected',
  allowanceCents: 'Allowance',
  estimatedCents: 'Estimate',
  actualCents: 'Actual',
};

/** The option that leaves a material off the schedule. */
export const NO_LINK = '';

let counter = 0;

/**
 * @param {{ ctx: AppContext, item?: MaterialItem }} config
 * @returns {import('../ui/Modal.js').ModalHandle}
 */
export function openMaterialEditor({ ctx, item }) {
  const prefix = `material-${++counter}`;
  const editing = item !== undefined;
  const projectId = ctx.payload?.project.id ?? item?.projectId ?? '';
  const schedule = [...(ctx.payload?.schedule ?? [])].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  const name = textField({
    id: `${prefix}-name`,
    label: MATERIAL_LABELS.name,
    value: item?.name ?? '',
    placeholder: 'Quartz countertop',
    required: true,
    wide: true,
  });
  name.input.setAttribute('autofocus', '');
  const scheduleItemId = selectField({
    id: `${prefix}-for`,
    label: MATERIAL_LABELS.scheduleItemId,
    value: item?.scheduleItemId ?? NO_LINK,
    options: [
      { value: NO_LINK, label: 'Nothing on the schedule' },
      ...schedule.map((s) => ({ value: s.id, label: s.title })),
    ],
  });
  const expectedDate = dateField({
    id: `${prefix}-expected`,
    label: MATERIAL_LABELS.expectedDate,
    value: item?.expectedDate ?? '',
  });
  const allowanceCents = moneyField({
    id: `${prefix}-allowance`,
    label: MATERIAL_LABELS.allowanceCents,
    cents: item?.allowanceCents ?? 0,
  });
  const estimatedCents = moneyField({
    id: `${prefix}-estimate`,
    label: MATERIAL_LABELS.estimatedCents,
    cents: item?.estimatedCents ?? 0,
  });
  const actualCents = moneyField({
    id: `${prefix}-actual`,
    label: MATERIAL_LABELS.actualCents,
    cents: item?.actualCents ?? null,
    placeholder: 'Blank until bought',
    blankIsNull: true,
  });
  const fields = {
    name,
    scheduleItemId,
    expectedDate,
    allowanceCents,
    estimatedCents,
    actualCents,
  };

  const formEl = form({
    ariaLabel: editing ? 'Edit material' : 'New material',
    onSubmit: submit,
  });
  formEl.id = `${prefix}-form`;
  formEl.append(
    name.el,
    scheduleItemId.el,
    expectedDate.el,
    allowanceCents.el,
    estimatedCents.el,
    actualCents.el,
  );

  const save = button({
    label: editing ? 'Save' : 'Add to materials',
    variant: 'primary',
    type: 'submit',
  });
  save.setAttribute('form', formEl.id);
  const actions = [
    button({ label: 'Cancel', onClick: () => dialog.requestClose() }),
    save,
  ];
  if (editing) {
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
    title: editing ? item.name : 'New material',
    body: [formEl],
    actions,
    beforeClose: discardGuard(fields),
    onClose: () => {
      unsubscribe();
      dialog.el.remove();
    },
  });

  // A write elsewhere refetches the project. If this material is gone,
  // the editor closes.
  const unsubscribe = ctx.on('payload', (payload) => {
    if (!editing) return;
    if (!payload || !payload.materials.some((m) => m.id === item.id)) {
      dialog.close();
    }
  });

  /** @returns {Required<MaterialItemInput> | null} */
  function readForm() {
    const money = {
      allowanceCents: allowanceCents.cents(),
      estimatedCents: estimatedCents.cents(),
      actualCents: actualCents.cents(),
    };
    /** @type {import('../entities/validate.js').FieldError[]} */
    const problems = [];
    for (const key of /** @type {const} */ ([
      'allowanceCents',
      'estimatedCents',
    ])) {
      if (money[key] === null) {
        problems.push({
          field: key,
          message: `${MATERIAL_LABELS[key]} must be dollars and cents, like 1,250.00`,
        });
      }
    }
    if (money.actualCents === null && actualCents.input.value.trim() !== '') {
      problems.push({
        field: 'actualCents',
        message: 'Actual must be dollars and cents, or blank',
      });
    }
    const input = {
      name: name.input.value.trim(),
      scheduleItemId: scheduleItemId.input.value || null,
      expectedDate: expectedDate.input.value || null,
      allowanceCents: money.allowanceCents ?? 0,
      estimatedCents: money.estimatedCents ?? 0,
      actualCents: money.actualCents,
    };
    problems.push(...materialItemErrors(input));
    return showProblems(fields, problems, MATERIAL_LABELS) ? null : input;
  }

  async function submit() {
    const input = readForm();
    if (!input) return;
    save.disabled = true;
    const outcome = await ctx.write(
      (api) =>
        editing
          ? api.patchMaterial(item.id, input)
          : api.createMaterial(projectId, input),
      { done: editing ? `Saved ${input.name}` : `Added ${input.name}` },
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
        MATERIAL_LABELS,
      );
    }
  }

  async function deleteItem() {
    if (!item) return;
    const yes = await confirmDialog({
      title: `Delete ${item.name}?`,
      message: 'The schedule item it is for stays as it is.',
    });
    if (!yes) return;
    await ctx.write((api) => api.deleteMaterial(item.id), {
      done: `Deleted ${item.name}`,
    });
  }

  document.body.append(dialog.el);
  dialog.open();
  return dialog;
}
