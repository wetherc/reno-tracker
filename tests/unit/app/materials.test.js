import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  allowanceVariance,
  landingDate,
  materialTotals,
  mountMaterials,
} from '../../../src/app/materials.js';
import { mountShell } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, materialOf, setupSchedule, tick } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {Parameters<typeof setupSchedule>[0]} [seed] */
async function setup(seed) {
  const fx = setupSchedule(seed);
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountMaterials({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  return { ...fx, shell, panel };
}

/** @param {any} shell */
const table = (shell) => shell.body.children[0];
/** @param {any} shell */
const rows = (shell) => $(table(shell).children[2]).children;
/** @param {any} shell */
const footer = (shell) => $(table(shell).children[3]).children[0];

const payload = /** @type {any} */ ({
  project: { startDate: '2026-09-01' },
  schedule: [itemOf('a', { startDate: '2026-10-05' })],
});

test('allowanceVariance counts the actual once it is entered', () => {
  assert.equal(allowanceVariance(materialOf('x')), 2000);
  assert.equal(
    allowanceVariance(materialOf('x', { actualCents: 9000 })),
    -1000,
  );
});

test('landingDate follows the expected date, then the item, then the project', () => {
  assert.deepEqual(
    landingDate(materialOf('x', { expectedDate: '2026-11-01' }), payload),
    {
      date: '2026-11-01',
      inferred: false,
    },
  );
  assert.deepEqual(
    landingDate(materialOf('x', { scheduleItemId: 'a' }), payload),
    {
      date: '2026-10-05',
      inferred: true,
    },
  );
  assert.deepEqual(
    landingDate(materialOf('x', { scheduleItemId: 'gone' }), payload),
    {
      date: '2026-09-01',
      inferred: true,
    },
  );
});

test('materialTotals sums the three prices, skipping blank actuals', () => {
  assert.deepEqual(
    materialTotals([materialOf('x'), materialOf('y', { actualCents: 500 })]),
    { allowanceCents: 20000, estimatedCents: 24000, actualCents: 500 },
  );
  assert.deepEqual(materialTotals([]), {
    allowanceCents: 0,
    estimatedCents: 0,
    actualCents: 0,
  });
});

test('show does nothing without a project', () => {
  const fx = setupSchedule();
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  mountMaterials({ ctx: fx.ctx, shell }).show();
  assert.equal(shell.body.children.length, 0);
});

test('an empty list invites the first material', async () => {
  const { shell } = await setup();
  assert.equal(shell.tools.children[0].textContent, 'Add material');
  const empty = $(shell.body.children[0]);
  assert.match(empty.textContent, /No materials listed for Kitchen yet/);
  empty.children[1].click();
  const dialog = $(dom.body.children[0]);
  assert.equal(dialog.tagName, 'DIALOG');
  assert.equal(dialog.children[0].children[0].textContent, 'New material');
  dialog.close();
});

test('the table has one row per material, a totals row, and the planned columns', async () => {
  const { shell } = await setup({
    schedule: [itemOf('a', { title: 'Cabinets', startDate: '2026-10-13' })],
    materials: [
      materialOf('m1', {
        name: 'Tile',
        scheduleItemId: 'a',
        actualCents: 9000,
        complete: true,
      }),
      materialOf('m2', {
        name: 'Faucet',
        expectedDate: '2026-11-02',
        allowanceCents: 30000,
        estimatedCents: 25000,
      }),
    ],
  });
  const heads = $(table(shell).children[1]).children[0].children;
  assert.deepEqual(
    heads.map((/** @type {any} */ th) => th.textContent),
    [
      'Bought',
      'Material',
      'For',
      'Expected',
      'Allowance',
      'Estimate',
      'Actual',
      'Vs allowance',
    ],
  );
  const [tile, faucet] = rows(shell);
  assert.equal(tile.classList.contains('material-row--complete'), true);
  const cells = tile.children.map((/** @type {any} */ td) => td.textContent);
  assert.deepEqual(cells.slice(2), [
    'Cabinets',
    'Oct 13',
    '$100.00',
    '$120.00',
    '$90.00',
    '−$10.00',
  ]);
  const expected = tile.children[3].children[0];
  assert.equal(expected.className, 'u-muted');
  assert.match(expected.title, /start of the schedule item/);
  const box = tile.children[0].children[0];
  assert.equal(box.checked, true);
  assert.equal(box.getAttribute('aria-label'), 'Unmark Tile');
  const name = tile.children[1].children[0];
  assert.equal(name.className, 'btn-bare material-name');
  assert.equal(name.children[0].getAttribute('aria-label'), 'Bought');

  assert.equal(
    faucet.children[0].children[0].getAttribute('aria-label'),
    'Mark Faucet bought',
  );
  assert.equal(faucet.children[2].textContent, '—');
  assert.equal(faucet.children[3].textContent, 'Nov 2');
  assert.equal(faucet.children[3].children[0].className, '');
  assert.equal(faucet.children[6].textContent, '—');
  assert.equal(faucet.children[7].textContent, '−$50.00');

  const totals = footer(shell).children.map(
    (/** @type {any} */ td) => td.textContent,
  );
  assert.deepEqual(totals, [
    '',
    'Total',
    '',
    '',
    '$400.00',
    '$370.00',
    '$90.00',
    '−$60.00',
  ]);
});

test('an unlinked material without a date lands on the project start', async () => {
  const { shell } = await setup({ materials: [materialOf('m1')] });
  const [row] = rows(shell);
  assert.equal(row.children[3].textContent, 'Sep 1');
  assert.match(row.children[3].children[0].title, /project start/);
});

test('the checkbox writes complete and rolls back on failure', async () => {
  const { shell, log, toasts, materials } = await setup({
    materials: [
      materialOf('m1', { name: 'Tile' }),
      materialOf('stuck', { name: 'Stuck' }),
    ],
  });
  let [tile] = rows(shell);
  const box = tile.children[0].children[0];
  box.checked = true;
  box.dispatchEvent({ type: 'change' });
  assert.equal(box.disabled, true);
  await tick();
  assert.deepEqual(log, ['bought m1 true']);
  assert.deepEqual(toasts, ['ok Marked Tile bought']);
  assert.equal(materials()[0].complete, true);
  let stuck;
  [tile, stuck] = rows(shell);
  const stuckBox = stuck.children[0].children[0];
  stuckBox.checked = true;
  stuckBox.dispatchEvent({ type: 'change' });
  await tick();
  assert.equal(stuckBox.checked, false);
  assert.equal(stuckBox.disabled, false);
  assert.equal(toasts.at(-1), 'bad stuck');
  tile.children[0].children[0].checked = false;
  tile.children[0].children[0].dispatchEvent({ type: 'change' });
  await tick();
  assert.equal(toasts.at(-1), 'ok Unmarked Tile');
});

test('the name opens the editor and a chosen sort outlives a write', async () => {
  const { shell, ctx } = await setup({
    materials: [
      materialOf('m1', { name: 'Zinc strip' }),
      materialOf('m2', { name: 'Adhesive' }),
    ],
  });
  rows(shell)[0].children[1].children[0].click();
  const dialog = $(dom.body.children[0]);
  assert.equal(dialog.children[0].children[0].textContent, 'Zinc strip');
  dialog.close();
  const heads = $(table(shell).children[1]).children[0].children;
  heads[1].children[0].click();
  const names = () =>
    rows(shell).map((/** @type {any} */ r) => r.children[1].textContent);
  assert.deepEqual(names(), ['Adhesive', 'Zinc strip']);
  await ctx.write((api) => api.setMaterialComplete('m1', true));
  assert.deepEqual(names(), ['Adhesive', 'Zinc strip']);
  assert.equal(heads[1].getAttribute('aria-sort'), 'ascending');
});
