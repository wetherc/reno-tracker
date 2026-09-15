import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { openMaterialEditor } from '../../../src/app/materialEditor.js';
import { itemOf, materialOf, setupSchedule, tick } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {any} form */
const shownErrors = (form) =>
  form
    .querySelectorAll('.form__error')
    .filter((/** @type {any} */ e) => !e.hidden)
    .map((/** @type {any} */ e) => e.textContent);

test('a new material lists schedule items by start and saves', async () => {
  const fx = setupSchedule({
    schedule: [
      itemOf('b', { title: 'Cabinets', startDate: '2026-10-13' }),
      itemOf('a', { title: 'Demo', startDate: '2026-10-01' }),
    ],
  });
  await fx.ctx.openProject('p1');
  const dialog = openMaterialEditor({ ctx: fx.ctx });
  const el = $(dialog.el);
  assert.equal(el.open, true);
  assert.equal(el.children[0].children[0].textContent, 'New material');
  const form = el.querySelector('form');
  assert.equal(form.getAttribute('aria-label'), 'New material');
  const select = form.querySelector('select');
  assert.deepEqual(
    select.children.map((/** @type {any} */ o) => o.textContent),
    ['Nothing on the schedule', 'Demo', 'Cabinets'],
  );
  assert.equal(select.value, '');

  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), ['name cannot be blank']);

  form.querySelector('[type="text"]').value = ' Quartz ';
  select.value = 'b';
  const money = form.querySelectorAll('[inputmode="decimal"]');
  money[0].value = '3,000';
  money[1].value = 'lots';
  money[2].value = 'x';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'Estimate must be dollars and cents, like 1,250.00',
    'Actual must be dollars and cents, or blank',
  ]);
  money[1].value = '3,400.50';
  money[2].value = '';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['create material Quartz']);
  assert.deepEqual(fx.toasts, ['ok Added Quartz']);
  assert.equal(el.open, false);
  assert.equal(dom.body.children.length, 0);
  assert.deepEqual(fx.materials()[0], {
    ...materialOf('m1'),
    name: 'Quartz',
    scheduleItemId: 'b',
    allowanceCents: 300000,
    estimatedCents: 340050,
    actualCents: null,
    expectedDate: null,
  });
});

test('a server field error lands under its field', async () => {
  const fx = setupSchedule();
  await fx.ctx.openProject('p1');
  const dialog = openMaterialEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');
  form.querySelector('[type="text"]').value = 'boom';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), ['no such item']);
  assert.equal(fx.toasts[0], 'bad no such item');
  assert.equal($(dialog.el).open, true);
  dialog.close();
});

test('editing fills the form, patches, and closes when the row is gone', async () => {
  const item = materialOf('m1', {
    name: 'Tile',
    expectedDate: '2026-11-02',
    actualCents: 9900,
  });
  const fx = setupSchedule({ materials: [item] });
  await fx.ctx.openProject('p1');
  const dialog = openMaterialEditor({ ctx: fx.ctx, item });
  const el = $(dialog.el);
  assert.equal(el.children[0].children[0].textContent, 'Tile');
  const form = el.querySelector('form');
  assert.equal(form.querySelector('[type="date"]').value, '2026-11-02');
  const money = form.querySelectorAll('[inputmode="decimal"]');
  assert.deepEqual(
    money.map((/** @type {any} */ m) => m.value),
    ['100.00', '120.00', '99.00'],
  );
  const buttons = el.children[2].children;
  assert.equal(buttons[0].textContent, 'Delete');
  assert.equal(buttons[0].classList.contains('editor__delete'), true);
  assert.equal(buttons[2].textContent, 'Save');

  form.querySelector('[type="date"]').value = '';
  money[2].value = '101';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['patch material m1']);
  assert.deepEqual(fx.toasts, ['ok Saved Tile']);
  assert.equal(fx.materials()[0].expectedDate, null);
  assert.equal(fx.materials()[0].actualCents, 10100);
  assert.equal(el.open, false);

  const again = openMaterialEditor({ ctx: fx.ctx, item: fx.materials()[0] });
  await fx.ctx.write((api) => api.deleteMaterial('m1'));
  assert.equal($(again.el).open, false);
  assert.equal(dom.body.children.length, 0);
});

test('delete asks first and writes on yes', async () => {
  const item = materialOf('m1', { name: 'Tile' });
  const fx = setupSchedule({ materials: [item] });
  await fx.ctx.openProject('p1');
  const dialog = openMaterialEditor({ ctx: fx.ctx, item });
  const remove = $(dialog.el).children[2].children[0];
  remove.click();
  await tick();
  let confirm = $(dom.body.children[1]);
  assert.equal(confirm.children[0].textContent, 'Delete Tile?');
  confirm.children[2].children[0].click();
  await tick();
  assert.deepEqual(fx.log, []);
  remove.click();
  await tick();
  confirm = $(dom.body.children[1]);
  confirm.children[2].children[1].click();
  await tick();
  assert.deepEqual(fx.log, ['delete material m1']);
  assert.deepEqual(fx.toasts, ['ok Deleted Tile']);
  assert.equal(dom.body.children.length, 0);
});
