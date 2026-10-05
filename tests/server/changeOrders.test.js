// Runs every change order case against the server, through the fetch
// client, and against the browser store, and expects the same answer
// from both.
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
  const order = await api.createChangeOrder(project.id, {
    number: '7',
    party: 'Pinch Plumbing',
    issuedDate: '2026-01-10',
    description: 'Move the drain',
    lines: [
      { scheduleItemId: tile.id, amountCents: 30_000, description: 'Labor' },
      /** @type {any} */ ({
        materialItemId: vanity.id,
        amountCents: 12_500,
        extra: 1,
      }),
    ],
  });
  return { project, tile, vanity, order };
}

for (const [name, make] of BACKENDS) {
  describe(`change orders on the ${name}`, () => {
    test('create stores a pending order with its lines and the payload lists it', async () => {
      const api = make();
      const { project, tile, vanity, order } = await seed(api);
      assert.equal(typeof order.id, 'string');
      assert.equal(order.projectId, project.id);
      assert.equal(order.approved, false);
      assert.equal(order.description, 'Move the drain');
      assert.deepEqual(
        order.lines.map(({ id: _id, ...rest }) => rest),
        [
          {
            scheduleItemId: tile.id,
            materialItemId: null,
            description: 'Labor',
            amountCents: 30_000,
          },
          {
            scheduleItemId: null,
            materialItemId: vanity.id,
            description: '',
            amountCents: 12_500,
          },
        ],
      );
      const payload = await api.getProject(project.id);
      assert.deepEqual(payload.changeOrders, [order]);
      const bare = await api.createChangeOrder(project.id, {
        party: 'P',
        issuedDate: '2026-01-05',
        approved: true,
        lines: [{ scheduleItemId: tile.id, amountCents: 1 }],
      });
      assert.deepEqual(
        [bare.number, bare.description, bare.approved],
        ['', '', true],
      );
      const listed = await api.getProject(project.id);
      assert.deepEqual(
        listed.changeOrders.map((c) => c.id),
        [bare.id, order.id],
      );
    });

    test('create refuses a bad body with the first problem', async () => {
      const api = make();
      const { project, tile } = await seed(api);
      const line = { scheduleItemId: tile.id, amountCents: 1 };
      await fails(
        api.createChangeOrder(project.id, {
          issuedDate: '2026-01-05',
          lines: [line],
        }),
        400,
        'party must be text, got undefined',
        'party',
      );
      await fails(
        api.createChangeOrder(project.id, {
          party: 'P',
          issuedDate: '2026-01-05',
          approved: /** @type {any} */ ('yes'),
          lines: [line],
        }),
        400,
        'approved must be true or false, got "yes"',
        'approved',
      );
      await fails(
        api.createChangeOrder(project.id, {
          party: 'P',
          issuedDate: '2026-01-05',
          lines: [line, { ...line, materialItemId: 'm' }],
        }),
        400,
        'line 2 must add to one schedule item or one material',
        'lines.1.item',
      );
      await fails(
        api.createChangeOrder(project.id, {
          party: 'P',
          issuedDate: '2026-01-05',
          lines: [{ ...line, amountCents: -1 }],
        }),
        400,
        'line 1: amountCents must be whole cents, zero or more, got -1',
        'lines.0.amountCents',
      );
      await fails(
        api.createChangeOrder('nope', {
          party: 'P',
          issuedDate: '2026-01-05',
          lines: [line],
        }),
        404,
        'No project with id nope',
      );
    });

    test('a line cannot add to a row of another project', async () => {
      const api = make();
      const { project } = await seed(api);
      const other = await seed(api);
      for (const line of [
        { scheduleItemId: other.tile.id, amountCents: 1 },
        { materialItemId: other.vanity.id, amountCents: 1 },
      ]) {
        const what = line.scheduleItemId ? 'schedule item' : 'material';
        await fails(
          api.createChangeOrder(project.id, {
            party: 'P',
            issuedDate: '2026-01-05',
            lines: [line],
          }),
          400,
          `line 1 adds to a ${what} that is not in this project`,
          'lines.0.item',
        );
      }
    });

    test('a patch approves and keeps the lines unless it names new ones', async () => {
      const api = make();
      const { tile, order } = await seed(api);
      const approved = await api.patchChangeOrder(order.id, {
        approved: true,
        number: '8',
      });
      assert.equal(approved.approved, true);
      assert.equal(approved.number, '8');
      assert.deepEqual(approved.lines, order.lines);
      const relined = await api.patchChangeOrder(order.id, {
        lines: [{ scheduleItemId: tile.id, amountCents: 99 }],
      });
      assert.equal(relined.lines.length, 1);
      assert.equal(relined.lines[0].amountCents, 99);
      assert.equal(relined.approved, true);
      await fails(
        api.patchChangeOrder(order.id, { lines: [] }),
        400,
        'lines must list at least one line',
        'lines',
      );
      await fails(
        api.patchChangeOrder(order.id, {
          lines: [{ materialItemId: 'x', amountCents: 1 }],
        }),
        400,
        'line 1 adds to a material that is not in this project',
        'lines.0.item',
      );
      await fails(
        api.patchChangeOrder('nope', {}),
        404,
        'No change order with id nope',
      );
    });

    test('a row that a change order names cannot be deleted until the order is gone', async () => {
      const api = make();
      const { project, tile, vanity, order } = await seed(api);
      await fails(
        api.deleteScheduleItem(tile.id),
        409,
        'Change order 7 from Pinch Plumbing adds to Tile. Remove that line first.',
      );
      const invoice = await api.createInvoice(project.id, {
        number: '1043',
        party: 'Pinch Plumbing',
        issuedDate: '2026-01-20',
        lines: [{ scheduleItemId: tile.id, amountCents: 5 }],
      });
      await fails(
        api.deleteScheduleItem(tile.id),
        409,
        'Invoice 1043 from Pinch Plumbing bills Tile. Remove that line first.',
      );
      await api.deleteInvoice(invoice.id);
      await api.patchChangeOrder(order.id, { number: '' });
      await fails(
        api.deleteMaterial(vanity.id),
        409,
        'A change order from Pinch Plumbing adds to Vanity. Remove that line first.',
      );
      await api.deleteChangeOrder(order.id);
      await fails(
        api.deleteChangeOrder(order.id),
        404,
        `No change order with id ${order.id}`,
      );
      await api.deleteScheduleItem(tile.id);
      await api.deleteMaterial(vanity.id);
      const payload = await api.getProject(project.id);
      assert.deepEqual(
        [payload.changeOrders, payload.schedule, payload.materials],
        [[], [], []],
      );
    });

    test('a project delete removes its change orders and leaves others', async () => {
      const api = make();
      const one = await seed(api);
      const two = await seed(api);
      await api.deleteProject(one.project.id);
      await fails(
        api.patchChangeOrder(one.order.id, {}),
        404,
        `No change order with id ${one.order.id}`,
      );
      const payload = await api.getProject(two.project.id);
      assert.deepEqual(payload.changeOrders, [two.order]);
    });

    test('export and import keep every line on its row', async () => {
      const api = make();
      const { project, order } = await seed(api);
      await api.patchChangeOrder(order.id, { approved: true });
      const file = await api.exportProject(project.id);
      assert.equal(file.changeOrders?.length, 1);
      const copy = await api.importProject(file);
      const [made] = copy.changeOrders;
      assert.equal(made.party, 'Pinch Plumbing');
      assert.equal(made.approved, true);
      assert.equal(made.description, 'Move the drain');
      assert.equal(made.projectId, copy.project.id);
      assert.equal(copy.schedule[0].id, made.lines[0].scheduleItemId);
      assert.equal(copy.materials[0].id, made.lines[1].materialItemId);
      assert.notEqual(made.id, order.id);
      assert.notEqual(made.lines[0].id, order.lines[0].id);

      const older = { ...file };
      delete older.changeOrders;
      const plain = await api.importProject(older);
      assert.deepEqual(plain.changeOrders, []);
    });
  });
}
