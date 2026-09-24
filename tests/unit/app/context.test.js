import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../../../src/app/context.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { ApiError } from '../../../src/api/errors.js';

const payloadFor = (/** @type {string} */ id) => ({
  project: {
    id,
    name: `P ${id}`,
    budgetCents: 0,
    startDate: '2026-01-05',
    createdAt: '',
  },
  schedule: [],
  dependencies: [],
  variances: [],
  notes: [],
  materials: [],
  invoices: [],
});

function setup() {
  /** @type {string[]} */
  const log = [];
  const api = /** @type {any} */ ({
    listProjects: async () => {
      log.push('list');
      return [payloadFor('a').project, payloadFor('b').project];
    },
    getProject: async (/** @type {string} */ id) => {
      log.push(`get ${id}`);
      return payloadFor(id);
    },
  });
  /** @type {string[]} */
  const toasts = [];
  const toaster = /** @type {any} */ ({
    success: (/** @type {string} */ m) => toasts.push(`ok ${m}`),
    failure: (/** @type {string} */ m) => toasts.push(`bad ${m}`),
  });
  const prefs = createPrefs(memoryStorage());
  return { ctx: createContext({ api, prefs, toaster }), log, toasts, prefs };
}

test('loadProjects and openProject store state, emit, and save the id', async () => {
  const { ctx, log, prefs } = setup();
  /** @type {string[]} */
  const seen = [];
  const off = ctx.on('projects', (p) => seen.push(`projects ${p.length}`));
  ctx.on('payload', (p) => seen.push(`payload ${p?.project.id ?? 'none'}`));
  assert.deepEqual(ctx.projects, []);
  assert.equal(ctx.payload, null);
  await ctx.loadProjects();
  assert.equal(ctx.projects.length, 2);
  const opened = await ctx.openProject('b');
  assert.equal(opened?.project.id, 'b');
  assert.equal(ctx.payload, opened);
  assert.equal(prefs.read('lastProject'), 'b');
  off();
  await ctx.loadProjects();
  ctx.closeProject();
  assert.equal(ctx.payload, null);
  assert.equal(prefs.read('lastProject'), null);
  assert.deepEqual(seen, ['projects 2', 'payload b', 'payload none']);
  assert.deepEqual(log, ['list', 'get b', 'list']);
});

test('refresh refetches only when a project is open', async () => {
  const { ctx, log } = setup();
  await ctx.refresh();
  assert.deepEqual(log, []);
  await ctx.openProject('a');
  await ctx.refresh();
  assert.deepEqual(log, ['get a', 'get a']);
});

test('write refetches, toasts done, and can reload the list', async () => {
  const { ctx, log, toasts } = setup();
  await ctx.openProject('a');
  const outcome = await ctx.write(async () => 42, { done: 'Saved' });
  assert.deepEqual(outcome, { ok: true, result: 42 });
  assert.deepEqual(toasts, ['ok Saved']);
  assert.deepEqual(log, ['get a', 'get a']);
  const quiet = await ctx.write(async () => 'x', { reload: true });
  assert.equal(quiet.ok, true);
  assert.deepEqual(log, ['get a', 'get a', 'list', 'get a']);
  assert.deepEqual(toasts, ['ok Saved']);
});

test('write toasts the failure and returns the error', async () => {
  const { ctx, toasts } = setup();
  const error = new ApiError(400, {
    error: 'title cannot be blank',
    field: 'title',
  });
  const outcome = await ctx.write(async () => {
    throw error;
  });
  assert.deepEqual(outcome, { ok: false, error });
  assert.deepEqual(toasts, ['bad title cannot be blank']);
});

test('an older fetch that lands after a newer one is dropped', async () => {
  const { ctx, prefs } = setup();
  const api = /** @type {any} */ (ctx.api);
  /** @type {Map<string, (value: unknown) => void>} */
  const waiting = new Map();
  api.getProject = (/** @type {string} */ id) =>
    new Promise((r) => waiting.set(id, () => r(payloadFor(id))));
  api.listProjects = () =>
    new Promise((r) =>
      waiting.set(`list ${waiting.size}`, () => r([payloadFor('x').project])),
    );
  /** @type {string[]} */
  const seen = [];
  ctx.on('payload', (p) => seen.push(p?.project.id ?? 'none'));
  ctx.on('projects', (p) => seen.push(`list ${p.length}`));

  const first = ctx.openProject('a');
  const second = ctx.openProject('b');
  /** @type {any} */ (waiting.get('b'))();
  assert.equal((await second)?.project.id, 'b');
  /** @type {any} */ (waiting.get('a'))();
  assert.equal((await first)?.project.id, 'b');
  assert.equal(ctx.payload?.project.id, 'b');
  assert.equal(prefs.read('lastProject'), 'b');

  const late = ctx.openProject('c');
  ctx.closeProject();
  /** @type {any} */ (waiting.get('c'))();
  assert.equal(await late, null);
  assert.equal(ctx.payload, null);

  const oldList = ctx.loadProjects();
  const newList = ctx.loadProjects();
  /** @type {any} */ (waiting.get('list 4'))();
  await newList;
  /** @type {any} */ (waiting.get('list 3'))();
  assert.equal((await oldList).length, 1);
  assert.deepEqual(seen, ['b', 'none', 'list 1']);
});
