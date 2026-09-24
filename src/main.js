// Composition root. Builds the AppContext, mounts the shell, then hands
// the panel to the feature module for the current section.
import { createBackend, readBackend } from './api/backend.js';
import { describeFailure } from './api/errors.js';
import { createContext } from './app/context.js';
import { mountCosts } from './app/costs.js';
import { mountInvoices } from './app/invoices.js';
import { mountMaterials } from './app/materials.js';
import { mountNotes } from './app/notesView.js';
import { mountProjects } from './app/projects.js';
import { mountSchedule } from './app/schedule.js';
import { mountShell, SECTIONS } from './app/shell.js';
import { startView } from './app/startView.js';
import { mountTheme } from './app/theme.js';
import { browserStorage, createPrefs } from './storage/prefs.js';
import { keepFocus, trackFocus } from './ui/focusKey.js';
import { createToaster } from './ui/Toast.js';

/** @param {string} id */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no element with id "${id}"`);
  return el;
}

trackFocus(document);
const storage = browserStorage();
const prefs = createPrefs(storage);
const toaster = createToaster(byId('toasts'));
const api = createBackend(readBackend(document), storage, window);
const ctx = createContext({ api, prefs, toaster });

mountTheme(byId('theme-toggle'), prefs);
const projects = mountProjects({ ctx, host: byId('project-picker') });
const shell = mountShell({
  sidebar: byId('sidebar'),
  main: byId('main'),
  prefs,
});

const schedule = mountSchedule({ ctx, shell });
const notes = mountNotes({ ctx, shell });
const materials = mountMaterials({ ctx, shell });
const invoices = mountInvoices({ ctx, shell });
const costs = mountCosts({ ctx, shell });

/** @type {import('./app/startView.js').StartState} */
let start = { kind: 'loading' };

function render() {
  const section = SECTIONS.find((s) => s.id === shell.section);
  shell.setTitle(section?.label ?? '');
  shell.tools.replaceChildren();
  if (!ctx.payload) {
    shell.setBody(
      startView(start, {
        onRetry: load,
        onNew: projects.newProject,
        onLoad: projects.importProject,
      }),
    );
    return;
  }
  if (shell.section === 'schedule') {
    schedule.show();
    return;
  }
  if (shell.section === 'notes') {
    notes.show();
    return;
  }
  if (shell.section === 'materials') {
    materials.show();
    return;
  }
  if (shell.section === 'invoices') {
    invoices.show();
    return;
  }
  costs.show();
}

// Each write rebuilds the panel, so focus goes back to the control that
// had it.
const redraw = () => keepFocus(render, shell.el);
shell.onSection(redraw);
ctx.on('payload', redraw);

/** @param {import('./app/startView.js').StartState} next */
function setStart(next) {
  start = next;
  if (!ctx.payload) redraw();
}

// Opens the last project, or the first one. Retry runs it again.
function load() {
  setStart({ kind: 'loading' });
  ctx
    .loadProjects()
    .then((projects) => {
      const last = prefs.read('lastProject');
      const id = projects.find((p) => p.id === last)?.id ?? projects[0]?.id;
      return id ? ctx.openProject(id) : null;
    })
    .then(
      () => setStart({ kind: 'ready' }),
      (error) => setStart({ kind: 'error', message: describeFailure(error) }),
    );
}

load();
