import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountProjects } from '../../../src/app/projects.js';
import { createContext } from '../../../src/app/context.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {string} id @param {string} name */
const projectOf = (id, name) => ({
  id,
  name,
  budgetCents: 0,
  startDate: '2026-01-05',
  createdAt: '',
});

function setup() {
  let projects = [projectOf('a', 'Attic'), projectOf('b', 'Bath')];
  /** @type {string[]} */
  const log = [];
  /** @type {string[]} */
  const toasts = [];
  const api = /** @type {any} */ ({
    listProjects: async () => projects,
    getProject: async (/** @type {string} */ id) => {
      const project = projects.find((p) => p.id === id);
      if (!project) throw new Error(`no project ${id}`);
      log.push(`get ${id}`);
      return {
        project,
        schedule: [],
        dependencies: [],
        variances: [],
        notes: [],
        materials: [],
      };
    },
    createProject: async (/** @type {any} */ input) => {
      const created = { ...projectOf('c', input.name), ...input };
      projects = [...projects, created];
      log.push(`create ${input.name}`);
      return created;
    },
    patchProject: async (
      /** @type {string} */ id,
      /** @type {any} */ input,
    ) => {
      projects = projects.map((p) => (p.id === id ? { ...p, ...input } : p));
      log.push(`patch ${id} ${input.name}`);
      return projects.find((p) => p.id === id);
    },
    deleteProject: async (/** @type {string} */ id) => {
      if (id === 'locked') throw new Error('locked');
      projects = projects.filter((p) => p.id !== id);
      log.push(`delete ${id}`);
    },
    exportProject: async (/** @type {string} */ id) => {
      if (id === 'locked') throw new Error('locked');
      log.push(`export ${id}`);
      return { format: 'reno-tracker/1', exportedAt: '2026-09-15T10:00:00Z' };
    },
    importProject: async (/** @type {any} */ file) => {
      if (file.project.name === 'boom') throw new Error('boom');
      const created = projectOf('d', file.project.name);
      projects = [...projects, created];
      log.push(`import ${file.project.name}`);
      return { project: created };
    },
  });
  const toaster = /** @type {any} */ ({
    success: (/** @type {string} */ m) => toasts.push(`ok ${m}`),
    failure: (/** @type {string} */ m) => toasts.push(`bad ${m}`),
  });
  const ctx = createContext({
    api,
    prefs: createPrefs(memoryStorage()),
    toaster,
  });
  /** @type {any[]} */
  const made = [];
  /** @type {string[]} */
  const urlLog = [];
  const files = {
    doc: /** @type {any} */ ({
      body: document.body,
      createElement: (/** @type {string} */ tag) => {
        const el = document.createElement(tag);
        made.push(el);
        return el;
      },
    }),
    urls: {
      createObjectURL: () => (urlLog.push('create'), 'blob:fake'),
      revokeObjectURL: (/** @type {string} */ href) =>
        void urlLog.push(`revoke ${href}`),
    },
  };
  const host = document.createElement('div');
  const picker = mountProjects({ ctx, host, files });
  const select = /** @type {any} */ (host.querySelector('select'));
  const [edit, remove, save, load] = $(host).querySelectorAll('.btn--icon');
  const start = /** @type {any} */ (host.querySelector('.btn--primary'));
  return {
    ctx,
    host,
    picker,
    select,
    edit,
    remove,
    save,
    load,
    start,
    log,
    toasts,
    made,
    urlLog,
    setProjects: (/** @type {any[]} */ p) => (projects = p),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('the picker hides the select until a project exists', async () => {
  const { ctx, host, select, edit, remove, start, setProjects } = setup();
  assert.equal(host.children[0].className, 'picker');
  assert.equal($(host.querySelector('label')).getAttribute('for'), select.id);
  assert.equal(select.hidden, true);
  assert.equal(edit.hidden, true);
  assert.equal(remove.hidden, true);
  assert.equal(start.hidden, false);
  setProjects([]);
  await ctx.loadProjects();
  assert.equal(select.hidden, true);
  setProjects([projectOf('a', 'Attic')]);
  await ctx.loadProjects();
  assert.equal(select.hidden, false);
  assert.equal(edit.disabled, true);
  assert.equal(remove.disabled, true);
  await ctx.openProject('a');
  assert.equal(edit.disabled, false);
  assert.equal(select.value, 'a');
});

test('changing the select opens that project and reports a failure', async () => {
  const { ctx, select, log, toasts } = setup();
  await ctx.loadProjects();
  await ctx.openProject('a');
  const options = select.children;
  assert.deepEqual(
    options.map((/** @type {any} */ o) => [o.value, o.textContent, o.selected]),
    [
      ['a', 'Attic', true],
      ['b', 'Bath', false],
    ],
  );
  select.value = 'b';
  select.dispatchEvent({ type: 'change' });
  await tick();
  assert.equal(ctx.payload?.project.id, 'b');
  select.value = 'zzz';
  select.dispatchEvent({ type: 'change' });
  await tick();
  assert.deepEqual(toasts, ['bad no project zzz']);
  assert.deepEqual(log, ['get a', 'get b']);
});

test('new project saves, reloads the list, and opens the new one', async () => {
  const { ctx, start, log, toasts } = setup();
  await ctx.loadProjects();
  $(start).click();
  const dialog = dom.body.children[0];
  const [name] = dialog.querySelectorAll('input');
  name.value = 'Cellar';
  dialog.querySelector('form').dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(ctx.payload?.project.name, 'Cellar');
  assert.deepEqual(log, ['create Cellar', 'get c']);
  assert.deepEqual(toasts, ['ok Started Cellar']);
  assert.equal(dom.body.children.length, 0);
});

test('edit project patches the open project', async () => {
  const { ctx, edit, picker, log, toasts } = setup();
  $(edit).click();
  assert.equal(dom.body.children.length, 0);
  await ctx.loadProjects();
  await ctx.openProject('b');
  $(edit).click();
  const dialog = dom.body.children[0];
  assert.equal(dialog.children[0].textContent, 'Edit Bath');
  const [name] = dialog.querySelectorAll('input');
  name.value = 'Bathroom';
  dialog.querySelector('form').dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(ctx.payload?.project.name, 'Bathroom');
  assert.deepEqual(log, ['get b', 'patch b Bathroom', 'get b']);
  assert.deepEqual(toasts, ['ok Saved Bathroom']);
  assert.equal(typeof picker.newProject, 'function');
});

test('delete asks first, then opens the next project', async () => {
  const { ctx, remove, select, log, toasts } = setup();
  $(remove).click();
  assert.equal(dom.body.children.length, 0);
  await ctx.loadProjects();
  await ctx.openProject('a');

  $(remove).click();
  await tick();
  let dialog = dom.body.children[0];
  assert.equal(dialog.children[0].textContent, 'Delete Attic?');
  $(dialog.children[2].children[0]).click();
  await tick();
  assert.equal(ctx.payload?.project.id, 'a');

  $(remove).click();
  await tick();
  dialog = dom.body.children[0];
  $(dialog.children[2].children[1]).click();
  await tick();
  assert.equal(ctx.payload?.project.id, 'b');
  assert.equal(select.children.length, 1);
  assert.deepEqual(log, ['get a', 'delete a', 'get b']);
  assert.deepEqual(toasts, ['ok Deleted Attic']);

  $(remove).click();
  await tick();
  $(dom.body.children[0].children[2].children[1]).click();
  await tick();
  assert.equal(ctx.payload, null);
  assert.equal(select.hidden, true);
});

test('a failed delete reopens the project', async () => {
  const { ctx, remove, toasts, setProjects } = setup();
  setProjects([projectOf('locked', 'Locked')]);
  await ctx.loadProjects();
  await ctx.openProject('locked');
  $(remove).click();
  await tick();
  $(dom.body.children[0].children[2].children[1]).click();
  await tick();
  assert.equal(ctx.payload?.project.id, 'locked');
  assert.deepEqual(toasts, ['bad locked']);
});

test('save downloads the open project as a named file', async () => {
  const { ctx, save, log, toasts, made, urlLog, setProjects } = setup();
  $(save).click();
  await tick();
  assert.deepEqual(log, []);
  await ctx.loadProjects();
  await ctx.openProject('a');
  $(save).click();
  await tick();
  assert.deepEqual(log, ['get a', 'export a']);
  assert.equal(made[0].download, 'attic-2026-09-15.json');
  assert.equal(made[0].href, 'blob:fake');
  assert.deepEqual(urlLog, ['create', 'revoke blob:fake']);
  assert.deepEqual(toasts, ['ok Saved attic-2026-09-15.json']);

  setProjects([projectOf('locked', 'Locked')]);
  await ctx.loadProjects();
  await ctx.openProject('locked');
  $(save).click();
  await tick();
  assert.deepEqual(toasts.at(-1), 'bad locked');
});

test('load reads a picked file, imports it, and opens the copy', async () => {
  const { ctx, load, log, toasts, made } = setup();
  await ctx.loadProjects();
  const pick = async (
    /** @type {{ name: string, text: string } | null} */ file,
  ) => {
    $(load).click();
    await tick();
    const input = made.at(-1);
    assert.equal(input.type, 'file');
    if (file) {
      input.files = [{ name: file.name, text: async () => file.text }];
      input.dispatchEvent({ type: 'change' });
    } else {
      input.dispatchEvent({ type: 'cancel' });
    }
    await tick();
    await tick();
  };
  await pick(null);
  assert.deepEqual(log, []);
  await pick({ name: 'bad.json', text: '{not json' });
  assert.deepEqual(toasts, [
    'bad bad.json is not a JSON file this app can read.',
  ]);
  await pick({ name: 'boom.json', text: '{"project":{"name":"boom"}}' });
  assert.deepEqual(toasts.at(-1), 'bad boom');
  assert.equal(ctx.payload, null);
  await pick({ name: 'deck.json', text: '{"project":{"name":"Deck"}}' });
  assert.deepEqual(log, ['import Deck', 'get d']);
  assert.deepEqual(toasts.at(-1), 'ok Loaded Deck from deck.json');
  assert.equal($(ctx).payload?.project.id, 'd');
});
