// Runs every invoice case against the server, through the fetch client,
// and against the browser store, and expects the same answer from both.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './harness.js';
import { createApi } from '../../src/api/client.js';
import { createLocalApi } from '../../src/local/api.js';
import { memoryStorage } from '../../src/storage/prefs.js';

/** @typedef {import('../../src/api/client.js').Api} Api */

const app = await startApp();
after(() => app.close());

/** @type {[string, () => Api][]} */
const BACKENDS = [
  ['server', () => createApi({ base: `http://127.0.0.1:${app.port}` })],
  ['browser', () => createLocalApi(memoryStorage())],
];

/**
 * @param {Promise<unknown>} work
 * @param {number} status
 * @param {string} message
 * @param {string} [field]
 */
async function fails(work, status, message, field) {
  const error = await work.then(
    () => null,
    (e) => e,
  );
  assert.ok(error, 'expected a rejection');
  assert.equal(error.status, status);
  assert.equal(error.message, message);
  assert.equal(error.field, field);
}

/** @param {Api} api */
async function seed(api) {
  const project = await api.createProject({
    name: 'Bath',
    startDate: '2026-01-05',
  });
  const tile = await api.createScheduleItem(project.id, {
    title: 'Tile',
    startDate: '2026-01-05',
    endDate: '2026-01-09',
  });
  const vanity = await api.createMaterial(project.id, { name: 'Vanity' });
  const invoice = await api.createInvoice(project.id, {
    number: '1043',
    party: 'Pinch Plumbing',
    issuedDate: '2026-01-10',
    dueDate: '2026-02-09',
    lines: [
      { scheduleItemId: tile.id, amountCents: 120_000, description: 'Labor' },
      /** @type {any} */ ({
        materialItemId: vanity.id,
        amountCents: 45_000,
        extra: 1,
      }),
    ],
  });
  return { project, tile, vanity, invoice };
}

for (const [name, make] of BACKENDS) {
  describe(`invoices on the ${name}`, () => {
    test('create stores the lines in order and the payload lists them', async () => {
      const api = make();
      const { project, tile, vanity, invoice } = await seed(api);
      assert.equal(typeof invoice.id, 'string');
      assert.equal(invoice.projectId, project.id);
      assert.deepEqual(
        invoice.lines.map(({ id: _id, ...rest }) => rest),
        [
          {
            scheduleItemId: tile.id,
            materialItemId: null,
            description: 'Labor',
            amountCents: 120_000,
          },
          {
            scheduleItemId: null,
            materialItemId: vanity.id,
            description: '',
            amountCents: 45_000,
          },
        ],
      );
      const payload = await api.getProject(project.id);
      assert.deepEqual(payload.invoices, [invoice]);
    });

    test('create refuses a bad body with the first problem', async () => {
      const api = make();
      const { project, tile } = await seed(api);
      const line = { scheduleItemId: tile.id, amountCents: 1 };
      await fails(
        api.createInvoice(project.id, {
          issuedDate: '2026-01-05',
          lines: [line],
        }),
        400,
        'party must be text, got undefined',
        'party',
      );
      await fails(
        api.createInvoice(project.id, {
          party: 'P',
          issuedDate: '2026-01-05',
          dueDate: '2026-01-04',
          lines: [line],
        }),
        400,
        'dueDate 2026-01-04 is before issuedDate 2026-01-05',
        'dueDate',
      );
      await fails(
        api.createInvoice(project.id, {
          party: 'P',
          issuedDate: '2026-01-05',
          lines: [line, { ...line, materialItemId: 'm' }],
        }),
        400,
        'line 2 must bill one schedule item or one material',
        'lines.1.item',
      );
      await fails(
        api.createInvoice('nope', {
          party: 'P',
          issuedDate: '2026-01-05',
          lines: [line],
        }),
        404,
        'No project with id nope',
      );
    });

    test('a line cannot bill a row of another project', async () => {
      const api = make();
      const { project } = await seed(api);
      const other = await seed(api);
      for (const line of [
        { scheduleItemId: other.tile.id, amountCents: 1 },
        { materialItemId: other.vanity.id, amountCents: 1 },
        { materialItemId: 'nope', amountCents: 1 },
      ]) {
        const what = line.scheduleItemId ? 'schedule item' : 'material';
        await fails(
          api.createInvoice(project.id, {
            party: 'P',
            issuedDate: '2026-01-05',
            lines: [line],
          }),
          400,
          `line 1 bills a ${what} that is not in this project`,
          'lines.0.item',
        );
      }
      const payload = await api.getProject(project.id);
      assert.equal(payload.invoices.length, 1);
    });

    test('a patch keeps the lines unless it names new ones', async () => {
      const api = make();
      const { tile, invoice } = await seed(api);
      const renamed = await api.patchInvoice(invoice.id, {
        number: '1044',
        dueDate: null,
      });
      assert.equal(renamed.number, '1044');
      assert.equal(renamed.dueDate, null);
      assert.deepEqual(renamed.lines, invoice.lines);

      const relined = await api.patchInvoice(invoice.id, {
        lines: [{ scheduleItemId: tile.id, amountCents: 99 }],
      });
      assert.equal(relined.lines.length, 1);
      assert.equal(relined.lines[0].amountCents, 99);
      assert.equal(relined.lines[0].description, '');

      await fails(
        api.patchInvoice(invoice.id, {
          issuedDate: '2026-03-01',
          dueDate: '2026-02-01',
        }),
        400,
        'dueDate 2026-02-01 is before issuedDate 2026-03-01',
        'dueDate',
      );
      await fails(
        api.patchInvoice(invoice.id, { lines: [] }),
        400,
        'lines must list at least one line',
        'lines',
      );
      await fails(
        api.patchInvoice(invoice.id, {
          lines: [{ materialItemId: 'x', amountCents: 1 }],
        }),
        400,
        'line 1 bills a material that is not in this project',
        'lines.0.item',
      );
      await fails(api.patchInvoice('nope', {}), 404, 'No invoice with id nope');
    });

    test('a billed row cannot be deleted until its invoice is gone', async () => {
      const api = make();
      const { project, tile, vanity, invoice } = await seed(api);
      const early = await api.createInvoice(project.id, {
        number: '900',
        party: 'Deposit Co',
        issuedDate: '2026-01-06',
        lines: [{ scheduleItemId: tile.id, amountCents: 5 }],
      });
      await fails(
        api.deleteScheduleItem(tile.id),
        409,
        'Invoice 900 from Deposit Co bills Tile. Remove that line first.',
      );
      await api.deleteInvoice(early.id);
      await fails(
        api.deleteScheduleItem(tile.id),
        409,
        'Invoice 1043 from Pinch Plumbing bills Tile. Remove that line first.',
      );
      await api.patchInvoice(invoice.id, { number: '' });
      await fails(
        api.deleteMaterial(vanity.id),
        409,
        'An invoice from Pinch Plumbing bills Vanity. Remove that line first.',
      );
      await api.deleteInvoice(invoice.id);
      await fails(
        api.deleteInvoice(invoice.id),
        404,
        `No invoice with id ${invoice.id}`,
      );
      await api.deleteScheduleItem(tile.id);
      await api.deleteMaterial(vanity.id);
      const payload = await api.getProject(project.id);
      assert.deepEqual(
        [payload.invoices, payload.schedule, payload.materials],
        [[], [], []],
      );
    });

    test('a project delete removes its invoices and leaves others', async () => {
      const api = make();
      const one = await seed(api);
      const two = await seed(api);
      await api.deleteProject(one.project.id);
      await fails(
        api.patchInvoice(one.invoice.id, {}),
        404,
        `No invoice with id ${one.invoice.id}`,
      );
      const payload = await api.getProject(two.project.id);
      assert.deepEqual(payload.invoices, [two.invoice]);
    });

    test('payments and retainage are stored, replaced, and kept', async () => {
      const api = make();
      const { project, invoice } = await seed(api);
      assert.equal(invoice.retainageCents, 0);
      assert.deepEqual(invoice.payments, []);

      const paid = await api.patchInvoice(invoice.id, {
        retainageCents: 8_250,
        payments: [
          { paidDate: '2026-01-20', amountCents: 100_000 },
          /** @type {any} */ ({
            paidDate: '2026-01-02',
            amountCents: 20_000,
            note: 'Deposit',
            extra: 1,
          }),
        ],
      });
      assert.equal(paid.retainageCents, 8_250);
      assert.deepEqual(
        paid.payments.map(({ id: _id, ...rest }) => rest),
        [
          { paidDate: '2026-01-02', amountCents: 20_000, note: 'Deposit' },
          { paidDate: '2026-01-20', amountCents: 100_000, note: '' },
        ],
      );
      assert.ok(paid.payments.every((p) => typeof p.id === 'string'));

      const renamed = await api.patchInvoice(invoice.id, { number: '7' });
      assert.deepEqual(renamed.payments, paid.payments);
      const payload = await api.getProject(project.id);
      assert.deepEqual(payload.invoices, [renamed]);

      const cleared = await api.patchInvoice(invoice.id, { payments: [] });
      assert.deepEqual(cleared.payments, []);

      await fails(
        api.patchInvoice(invoice.id, {
          payments: [{ paidDate: '2026-01-20', amountCents: 0 }],
        }),
        400,
        'payment 1: amountCents must be more than zero',
        'payments.0.amountCents',
      );
      await fails(
        api.createInvoice(project.id, {
          party: 'P',
          issuedDate: '2026-01-05',
          retainageCents: -5,
          lines: invoice.lines,
        }),
        400,
        'retainageCents must be whole cents, zero or more, got -5',
        'retainageCents',
      );

      const made = await api.createInvoice(project.id, {
        party: 'P',
        issuedDate: '2026-01-05',
        retainageCents: 10,
        lines: invoice.lines,
        payments: [{ paidDate: '2026-01-05', amountCents: 5 }],
      });
      assert.equal(made.retainageCents, 10);
      assert.equal(made.payments[0].note, '');
    });

    test('export and import keep every line on its row', async () => {
      const api = make();
      const { project } = await seed(api);
      const file = await api.exportProject(project.id);
      assert.equal(file.invoices?.length, 1);
      const copy = await api.importProject(file);
      const [invoice] = copy.invoices;
      assert.equal(invoice.party, 'Pinch Plumbing');
      assert.equal(invoice.projectId, copy.project.id);
      assert.equal(copy.schedule[0].id, invoice.lines[0].scheduleItemId);
      assert.equal(copy.materials[0].id, invoice.lines[1].materialItemId);
      assert.notEqual(invoice.id, file.invoices?.[0].id);

      await api.patchInvoice(file.invoices?.[0].id ?? '', {
        retainageCents: 40,
        payments: [{ paidDate: '2026-01-12', amountCents: 500, note: 'Check' }],
      });
      const paidFile = await api.exportProject(project.id);
      const paidCopy = (await api.importProject(paidFile)).invoices[0];
      assert.equal(paidCopy.retainageCents, 40);
      assert.deepEqual(
        paidCopy.payments.map(({ id: _id, ...rest }) => rest),
        [{ paidDate: '2026-01-12', amountCents: 500, note: 'Check' }],
      );
      assert.notEqual(
        paidCopy.payments[0].id,
        paidFile.invoices?.[0].payments[0].id,
      );

      const older = { ...file };
      delete older.invoices;
      const plain = await api.importProject(older);
      assert.deepEqual(plain.invoices, []);
    });
  });
}
