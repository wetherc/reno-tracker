import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { dependencyLinks, describeGap } from '../../../src/app/dependencies.js';
import { itemOf, setupSchedule, tick } from './scheduleFixtures.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {string} id @param {string} pred @param {string} succ */
const linkOf = (id, pred, succ) => ({
  id,
  projectId: 'p1',
  predecessorId: pred,
  successorId: succ,
});

const demo = itemOf('a', {
  title: 'Demo',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
});
const plumbing = itemOf('b', {
  title: 'Rough plumbing',
  startDate: '2026-10-06',
  endDate: '2026-10-10',
});
const cabinets = itemOf('c', {
  title: 'Cabinets',
  startDate: '2026-10-09',
  endDate: '2026-10-17',
});

test('describeGap puts the free days into words', () => {
  assert.deepEqual(describeGap(demo, plumbing), {
    text: '2 days free',
    overlap: false,
  });
  assert.deepEqual(describeGap(plumbing, cabinets), {
    text: 'overlaps by 2 days',
    overlap: true,
  });
  assert.deepEqual(
    describeGap(demo, itemOf('x', { startDate: '2026-10-04' })),
    { text: 'back to back', overlap: false },
  );
  assert.deepEqual(
    describeGap(demo, itemOf('x', { startDate: '2026-10-05' })),
    { text: '1 day free', overlap: false },
  );
  assert.deepEqual(
    describeGap(demo, itemOf('x', { startDate: '2026-10-03' })),
    { text: 'overlaps by 1 day', overlap: true },
  );
});

async function setup(/** @type {string} */ itemId) {
  const fx = setupSchedule({
    schedule: [demo, plumbing, cabinets],
    dependencies: [linkOf('d1', 'a', 'b'), linkOf('d2', 'b', 'c')],
  });
  await fx.ctx.openProject('p1');
  const item = /** @type {any} */ (fx.items().find((i) => i.id === itemId));
  const links = dependencyLinks({ ctx: fx.ctx, item });
  fx.ctx.on('payload', (p) => p && links.update(p));
  const el = $(links.el);
  const [waitsOn, holdsUp] = el.querySelectorAll('ul');
  const picker = el.querySelector('form');
  return { ...fx, el, waitsOn, holdsUp, picker };
}

test('lists both directions with the gap and hides the empty text', async () => {
  const { el, waitsOn, holdsUp, picker } = await setup('b');
  assert.equal(el.className, 'links');
  assert.deepEqual(
    el
      .querySelectorAll('.section-label')
      .map((/** @type {any} */ h) => h.textContent),
    ['Waits on', 'Holds up'],
  );
  assert.equal(waitsOn.children.length, 1);
  const row = waitsOn.children[0];
  assert.equal(row.children[0].textContent, 'Demo');
  assert.equal(row.children[1].textContent, '2 days free');
  assert.equal(row.children[1].className, 'badge');
  assert.equal(row.children[2].getAttribute('aria-label'), 'Unlink Demo');
  assert.equal(holdsUp.children[0].children[0].textContent, 'Cabinets');
  assert.equal(
    holdsUp.children[0].children[1].className,
    'badge badge--danger',
  );
  assert.equal(
    holdsUp.children[0].children[1].textContent,
    'overlaps by 2 days',
  );
  assert.equal(holdsUp.children[0].children.length, 2);
  const empties = el.querySelectorAll('.empty-state');
  assert.deepEqual(
    empties.map((/** @type {any} */ e) => e.hidden),
    [true, true],
  );
  // Every other item is already linked, so there is nothing to pick.
  assert.equal(picker.hidden, true);
});

test('an unlinked item offers the others and links one', async () => {
  const fx = setupSchedule({ schedule: [demo, plumbing, cabinets] });
  await fx.ctx.openProject('p1');
  const links = dependencyLinks({ ctx: fx.ctx, item: cabinets });
  fx.ctx.on('payload', (p) => p && links.update(p));
  const el = $(links.el);
  const [waitsOn] = el.querySelectorAll('ul');
  const picker = el.querySelector('form');
  assert.equal(waitsOn.hidden, true);
  assert.equal(
    el.querySelectorAll('.empty-state')[0].textContent,
    'Waits on nothing. It can start any time.',
  );
  const select = picker.querySelector('select');
  assert.deepEqual(
    select.children.map((/** @type {any} */ o) => o.textContent),
    ['Demo', 'Rough plumbing'],
  );
  select.value = 'b';
  picker.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['link b -> c']);
  assert.deepEqual(fx.toasts, ['ok Cabinets now waits on Rough plumbing']);
  assert.equal(waitsOn.hidden, false);
  assert.equal(waitsOn.children[0].children[0].textContent, 'Rough plumbing');
  // The picker drops the linked item.
  assert.deepEqual(
    picker
      .querySelector('select')
      .children.map((/** @type {any} */ o) => o.textContent),
    ['Demo'],
  );
});

test('a loop shows the server message under the picker', async () => {
  const { picker, log, toasts } = await setup('a');
  const select = picker.querySelector('select');
  assert.deepEqual(
    select.children.map((/** @type {any} */ o) => o.textContent),
    ['Cabinets'],
  );
  picker.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(log, []);
  const error = picker.querySelector('.form__error');
  assert.equal(error.hidden, false);
  assert.equal(
    error.textContent,
    'This dependency makes a loop: Demo -> Rough plumbing -> Cabinets -> Demo',
  );
  assert.equal(select.getAttribute('aria-invalid'), 'true');
  assert.equal(toasts.length, 1);
});

test('a plain failure toasts and leaves the picker clean', async () => {
  const fx = setupSchedule({
    schedule: [demo, itemOf('boom', { title: 'Boom' })],
  });
  await fx.ctx.openProject('p1');
  const el = $(dependencyLinks({ ctx: fx.ctx, item: demo }).el);
  const picker = el.querySelector('form');
  picker.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.toasts, ['bad boom']);
  assert.equal(picker.querySelector('.form__error').hidden, true);
});

test('unlink removes the row', async () => {
  const { waitsOn, log, toasts } = await setup('b');
  waitsOn.children[0].children[2].click();
  await tick();
  assert.deepEqual(log, ['unlink d1']);
  assert.deepEqual(toasts, ['ok Rough plumbing no longer waits on Demo']);
  assert.equal(waitsOn.hidden, true);
});

test('with no other items the picker stays hidden', async () => {
  const fx = setupSchedule({ schedule: [demo] });
  await fx.ctx.openProject('p1');
  const el = $(dependencyLinks({ ctx: fx.ctx, item: demo }).el);
  assert.equal(el.querySelector('form').hidden, true);
});

test('with no open project the lists start empty', () => {
  const fx = setupSchedule({ schedule: [demo] });
  const el = $(dependencyLinks({ ctx: fx.ctx, item: demo }).el);
  assert.equal(el.querySelectorAll('ul')[0].children.length, 0);
});
