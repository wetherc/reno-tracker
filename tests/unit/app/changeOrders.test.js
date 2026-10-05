import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  changeOrderSums,
  mountChangeOrders,
  pendingNote,
} from '../../../src/app/changeOrders.js';
import { openChangeOrderEditor } from '../../../src/app/changeOrderEditor.js';
import { mountShell } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { todayIso } from '../../../src/schedule/dates.js';
import {
  changeOrderOf,
  itemOf,
  lineOf,
  materialOf,
  setupSchedule,
  tick,
} from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {Parameters<typeof setupSchedule>[0]} [seed] */
async function setup(seed, saved = {}) {
  const fx = setupSchedule(seed);
  for (const [key, value] of Object.entries(saved)) {
    fx.ctx.prefs.write(/** @type {any} */ (key), value);
  }
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountChangeOrders({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  return { ...fx, shell, panel };
}

/** @param {any} shell */
const table = (shell) => shell.body.children[0].children[0];
/** @param {any} shell */
const rows = (shell) => $(table(shell).children[2]).children;
/** @param {any} shell */
const cellText = (shell) =>
  rows(shell).map((/** @type {any} */ tr) =>
    tr.children.map((/** @type {any} */ td) => td.textContent),
  );

/** @param {any} form */
const shownErrors = (form) =>
  form
    .querySelectorAll('.form__error')
    .filter((/** @type {any} */ e) => !e.hidden)
    .map((/** @type {any} */ e) => e.textContent);

const seed = {
  schedule: [itemOf('a', { title: 'Demo' })],
  materials: [materialOf('m', { name: 'Vanity' })],
  changeOrders: [
    changeOrderOf('c1', {
      number: '7',
      party: 'Pinch Plumbing',
      issuedDate: '2026-10-20',
      lines: [
        lineOf({ scheduleItemId: 'a' }, 5000),
        lineOf({ materialItemId: 'm' }, 2500),
      ],
    }),
    changeOrderOf('c2', {
      party: 'Acme',
      approved: false,
      issuedDate: '2026-10-05',
      lines: [lineOf({ scheduleItemId: 'a' }, 300)],
    }),
  ],
};

test('changeOrderSums and pendingNote split approved from pending', () => {
  const sums = changeOrderSums(seed.changeOrders);
  assert.deepEqual(sums, {
    approvedCents: 7500,
    pendingCents: 300,
    pendingCount: 1,
  });
  assert.equal(
    pendingNote(sums)[0].textContent,
    '1 pending change order adds $3.00 once approved. The total counts approved change orders only.',
  );
  assert.match(
    pendingNote({ ...sums, pendingCount: 2 })[0].textContent,
    /^2 pending change orders add/,
  );
  assert.deepEqual(pendingNote({ ...sums, pendingCount: 0 }), []);
});

test('show does nothing without a project', () => {
  const fx = setupSchedule();
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  mountChangeOrders({ ctx: fx.ctx, shell }).show();
  assert.equal(shell.body.children.length, 0);
});

test('a project with no rows points to Schedule and Materials', async () => {
  const { shell } = await setup();
  assert.equal($(shell.tools.children[0]).disabled, true);
  assert.match(
    $(shell.body.children[0]).textContent,
    /Kitchen has none yet\. Add one under Schedule or Materials first\./,
  );
});

test('an empty list invites the first change order', async () => {
  const { shell } = await setup({ schedule: [itemOf('a')] });
  const add = $(shell.tools.children[0]);
  assert.equal(add.textContent, 'Add change order');
  add.click();
  $(dom.body.children[0]).close();
  const empty = $(shell.body.children[0]);
  assert.match(empty.textContent, /No change orders for Kitchen yet/);
  empty.children[1].click();
  const dialog = $(dom.body.children[0]);
  assert.equal(dialog.children[0].children[0].textContent, 'New change order');
  dialog.close();
});

test('the table lists every change order and totals the approved ones', async () => {
  const fx = await setup(seed, { changeOrdersSort: 'total:asc' });
  const { shell } = fx;
  assert.deepEqual(cellText(shell), [
    ['Acme', '—', 'Oct 5', 'Demo', 'Pending', '$3.00'],
    ['Pinch Plumbing', '7', 'Oct 20', 'Demo, Vanity', 'Approved', '$75.00'],
  ]);
  const foot = $(table(shell).children[3]).children[0].children;
  assert.deepEqual(
    foot.map((/** @type {any} */ td) => td.textContent),
    ['Approved', '', '', '', '', '$75.00'],
  );
  assert.match($(shell.body.children[1]).textContent, /adds \$3\.00/);
  const heads = $(table(shell).children[1]).children[0].children;
  for (const [i, first] of /** @type {const} */ ([
    [0, 'Acme'],
    [1, 'Acme'],
    [2, 'Acme'],
    [3, 'Acme'],
    [4, 'Acme'],
  ])) {
    heads[i].children[0].click();
    assert.equal(cellText(shell)[0][0], first);
  }
  heads[0].children[0].click();
  heads[0].children[0].click();
  assert.equal(cellText(shell)[0][0], 'Pinch Plumbing');
  assert.equal(fx.ctx.prefs.read('changeOrdersSort'), 'party:desc');
  rows(shell)[0].children[0].children[0].click();
  const dialog = $(dom.body.children[0]);
  assert.equal(
    dialog.children[0].children[0].textContent,
    'Change order 7 from Pinch Plumbing',
  );
  dialog.close();
});

test('a new change order starts pending, totals its lines, and saves', async () => {
  const fx = await setup({ schedule: [itemOf('a')] });
  const dialog = openChangeOrderEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');
  assert.equal(form.querySelector('[type="date"]').value, todayIso());
  assert.equal(form.querySelector('select').value, 'pending');
  const line = form.querySelector('.line-item');
  line.querySelector('select').value = 'schedule:a';
  const amount = line.querySelector('[inputmode="decimal"]');
  amount.value = '1,200';
  amount.dispatchEvent({ type: 'input' });
  assert.equal(
    form.querySelector('.line-list__total').textContent,
    'Total $1,200.00',
  );
  const [, party] = form.querySelectorAll('[type="text"]');
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), ['From cannot be blank']);
  party.value = 'Pinch';
  form.querySelector('textarea').value = ' More tile ';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['create change order Pinch']);
  assert.deepEqual(fx.toasts, ['ok Added a change order from Pinch']);
  const [made] = fx.changeOrders();
  assert.equal(made.approved, false);
  assert.equal(made.description, 'More tile');
  assert.deepEqual(made.lines, [
    {
      scheduleItemId: 'a',
      materialItemId: null,
      amountCents: 120000,
      description: '',
    },
  ]);
});

test('a line problem names the line note, and a server error lands under its line', async () => {
  const fx = await setup({ schedule: [itemOf('a')] });
  const dialog = openChangeOrderEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');
  const [, party] = form.querySelectorAll('[type="text"]');
  party.value = 'Pinch';
  const line = form.querySelector('.line-item');
  line.querySelector('select').value = 'schedule:a';
  line.querySelectorAll('[type="text"]').at(-1).value = 'x'.repeat(201);
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), ['Line 1: Note is over 200 characters']);
  line.querySelectorAll('[type="text"]').at(-1).value = '';
  party.value = 'boom';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'Line 1 adds to a material that is not in this project',
  ]);
  assert.equal($(dialog.el).open, true);
  dialog.close();
});

test('editing approves, patches, and closes when the change order is gone', async () => {
  const fx = await setup(seed);
  const order = fx.changeOrders()[1];
  const dialog = openChangeOrderEditor({ ctx: fx.ctx, order });
  const form = $(dialog.el).querySelector('form');
  form.querySelector('select').value = 'approved';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['patch change order c2']);
  assert.equal(fx.changeOrders()[1].approved, true);
  assert.deepEqual(fx.toasts, ['ok Saved a change order from Acme']);

  const again = openChangeOrderEditor({ ctx: fx.ctx, order });
  await fx.ctx.write((api) => api.deleteChangeOrder('c2'));
  assert.equal($(again.el).open, false);
});

test('delete asks first, names what happens to the estimates, and writes on yes', async () => {
  const fx = await setup(seed);
  for (const [order, message] of /** @type {const} */ ([
    [fx.changeOrders()[1], 'It is pending, so no estimate changes.'],
    [
      fx.changeOrders()[0],
      'The rows it adds to go back to the estimates typed on them.',
    ],
  ])) {
    const dialog = openChangeOrderEditor({ ctx: fx.ctx, order });
    $(dialog.el).querySelector('.editor__delete').click();
    await tick();
    const confirm = $(dom.body.children.at(-1));
    assert.match(confirm.textContent, new RegExp(message));
    confirm.querySelector('.btn--danger').click();
    await tick();
    await tick();
  }
  assert.deepEqual(fx.log, [
    'delete change order c2',
    'delete change order c1',
  ]);
  assert.deepEqual(fx.toasts, [
    'ok Deleted a change order from Acme',
    'ok Deleted change order 7 from Pinch Plumbing',
  ]);
});

test('a changed line asks before the editor closes', async () => {
  const fx = await setup(seed);
  const dialog = openChangeOrderEditor({
    ctx: fx.ctx,
    order: fx.changeOrders()[0],
  });
  const form = $(dialog.el).querySelector('form');
  form
    .querySelector('.line-item')
    .querySelector('[inputmode="decimal"]').value = '1';
  dialog.requestClose();
  await tick();
  assert.equal(
    $(dom.body.children.at(-1)).textContent.includes('Discard'),
    true,
  );
  $(dom.body.children.at(-1)).querySelector('.btn--danger').click();
  await tick();
  assert.equal($(dialog.el).open, false);
});

test('the markup starts at the project rate, moves the total, and saves', async () => {
  const fx = await setup({ schedule: [itemOf('a')], markupBasisPoints: 1500 });
  const dialog = openChangeOrderEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');
  const rate = form.querySelector('.line-list__markup').querySelector('input');
  assert.equal(rate.value, '15');
  const line = form.querySelector('.line-item');
  line.querySelector('select').value = 'schedule:a';
  const amount = line.querySelector('[inputmode="decimal"]');
  amount.value = '200';
  amount.dispatchEvent({ type: 'input' });
  const total = form.querySelector('.line-list__total');
  assert.equal(
    total.textContent,
    'Lines $200.00 + 15% markup $30.00 = total $230.00',
  );
  rate.value = '5';
  rate.dispatchEvent({ type: 'input' });
  assert.equal(
    total.textContent,
    'Lines $200.00 + 5% markup $10.00 = total $210.00',
  );
  form.querySelectorAll('[type="text"]')[1].value = 'Pinch';
  rate.value = 'lots';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(rate.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(fx.log, []);
  rate.value = '5';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(fx.changeOrders()[0].markupBasisPoints, 500);
});

test('a change order with markup names it under its total', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a', { title: 'Demo' })],
    changeOrders: [
      changeOrderOf('c1', {
        markupBasisPoints: 1000,
        lines: [lineOf({ scheduleItemId: 'a' }, 2000)],
      }),
    ],
  });
  const cells = rows(shell)[0].children;
  assert.equal(cells[5].textContent, '$22.00$2.00 markup');
  assert.match($(table(shell).children[3]).textContent, /\$22\.00/);
});
