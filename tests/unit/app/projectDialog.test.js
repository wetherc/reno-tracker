import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { openProjectDialog } from '../../../src/app/projectDialog.js';
import { ApiError } from '../../../src/api/errors.js';

const dom = installDom();

const tick = () => new Promise((r) => setTimeout(r, 0));

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

const project = {
  id: 'p1',
  name: 'Kitchen',
  budgetCents: 1250000,
  startDate: '2026-03-02',
  createdAt: '',
};

/** @param {import('../../../src/ui/Modal.js').ModalHandle} dialog */
function parts(dialog) {
  const formEl = $(dialog.body.children[0]);
  const [name, start, budget] = formEl.querySelectorAll('input');
  const [cancel, save] = $(dialog.el.children[2]).children;
  const submit = () => formEl.dispatchEvent({ type: 'submit' });
  return { formEl, name, start, budget, cancel, save, submit };
}

test('a new project dialog defaults to today and a zero budget', () => {
  /** @type {unknown[]} */
  const saved = [];
  const dialog = openProjectDialog({
    async onSave(input) {
      saved.push(input);
      return { ok: true, result: undefined };
    },
  });
  assert.equal(dom.body.children[0], dialog.el);
  assert.equal(dialog.el.open, true);
  assert.equal(dialog.el.children[0].textContent, 'New project');
  const { formEl, name, start, budget, save, submit } = parts(dialog);
  assert.equal(formEl.getAttribute('aria-label'), 'New project');
  assert.equal(name.hasAttribute('autofocus'), true);
  assert.match(start.value, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(budget.value, '0.00');
  assert.equal(save.textContent, 'Start project');
  assert.equal(save.getAttribute('form'), formEl.id);

  name.value = '  Bath  ';
  start.value = '2026-04-01';
  budget.value = '$8,000';
  submit();
  return Promise.resolve().then(() => {
    assert.deepEqual(saved, [
      { name: 'Bath', startDate: '2026-04-01', budgetCents: 800000 },
    ]);
    assert.equal(dialog.el.open, false);
    assert.equal(dom.body.children.length, 0);
  });
});

test('an edit dialog is prefilled and cancel closes without saving', async () => {
  let calls = 0;
  const dialog = openProjectDialog({
    project,
    onSave: async () => {
      calls++;
      return { ok: true, result: undefined };
    },
  });
  assert.equal(dialog.el.children[0].textContent, 'Edit Kitchen');
  const { name, start, budget, cancel, save } = parts(dialog);
  assert.equal(name.value, 'Kitchen');
  assert.equal(start.value, '2026-03-02');
  assert.equal(budget.value, '12500.00');
  assert.equal(save.textContent, 'Save');
  $(cancel).click();
  await tick();
  assert.equal(dialog.el.open, false);
  assert.equal(calls, 0);
});

test('an edited form asks before it closes and keeps the edits on no', async () => {
  const dialog = openProjectDialog({
    project,
    onSave: async () => ({ ok: true, result: undefined }),
  });
  const { name, cancel } = parts(dialog);
  name.value = 'Kitchen and pantry';
  $(cancel).click();
  await tick();
  assert.equal(dialog.el.open, true);
  const ask = $(dom.body.children[1]);
  assert.equal(ask.children[0].children[0].textContent, 'Discard changes?');
  const [keep, discard] = ask.children[2].children;
  assert.equal(discard.textContent, 'Discard');
  keep.click();
  await tick();
  assert.equal(dialog.el.open, true);
  assert.equal(name.value, 'Kitchen and pantry');
  // Escape asks the same way, and Discard closes.
  assert.equal($(dialog.el).dispatchEvent({ type: 'cancel' }), false);
  await tick();
  $(dom.body.children[1]).children[2].children[1].click();
  await tick();
  assert.equal(dialog.el.open, false);
  assert.equal(dom.body.children.length, 0);
});

test('field errors block the save and clear on the next try', async () => {
  let calls = 0;
  const dialog = openProjectDialog({
    project,
    onSave: async () => {
      calls++;
      return { ok: true, result: undefined };
    },
  });
  const { name, start, budget, submit } = parts(dialog);
  const errorOf = (/** @type {any} */ input) =>
    input.parentNode.querySelector('.form__error');

  budget.value = 'lots';
  submit();
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(budget.getAttribute('aria-invalid'), 'true');
  assert.match(errorOf(budget).textContent, /dollars and cents/);

  budget.value = '10';
  name.value = '   ';
  submit();
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(budget.getAttribute('aria-invalid'), null);
  assert.equal(errorOf(name).textContent, 'name cannot be blank');
  assert.equal(name.getAttribute('aria-describedby'), errorOf(name).id);

  name.value = 'Kitchen';
  start.value = '';
  submit();
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.match(errorOf(start).textContent, /startDate must be a date/);
  dialog.close();
});

test('a server field error lands on the field; other errors leave it open', async () => {
  /** @type {unknown[]} */
  const answers = [
    {
      ok: false,
      error: new ApiError(400, { error: 'name is taken', field: 'name' }),
    },
    { ok: false, error: new ApiError(500, { error: 'boom' }) },
    { ok: false, error: new Error('offline') },
  ];
  const dialog = openProjectDialog({
    project,
    onSave: async () => /** @type {any} */ (answers.shift()),
  });
  const { name, save, submit } = parts(dialog);
  submit();
  assert.equal(save.disabled, true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(save.disabled, false);
  assert.equal(dialog.el.open, true);
  assert.equal(
    name.parentNode.querySelector('.form__error').textContent,
    'name is taken',
  );
  submit();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(name.getAttribute('aria-invalid'), null);
  assert.equal(dialog.el.open, true);
  submit();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(dialog.el.open, true);
  dialog.close();
});
