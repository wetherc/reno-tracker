// Composition root. Builds the AppContext, mounts the shell, then hands
// the panel to the feature module for the current section.
import { createBackend, readBackend } from './api/backend.js';
import { describeFailure } from './api/errors.js';
import { createContext } from './app/context.js';
import { mountCosts } from './app/costs.js';
import { mountMaterials } from './app/materials.js';
import { mountNotes } from './app/notesView.js';
import { mountProjects } from './app/projects.js';
import { mountSchedule } from './app/schedule.js';
import { mountShell, SECTIONS } from './app/shell.js';
import { mountTheme } from './app/theme.js';
import { browserStorage, createPrefs } from './storage/prefs.js';
import { button } from './ui/buttons.js';
import { emptyState } from './ui/emptyState.js';
import { createToaster } from './ui/Toast.js';

/** @param {string} id */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no element with id "${id}"`);
  return el;
}

const storage = browserStorage();
const prefs = createPrefs(storage);
const toaster = createToaster(byId('toasts'));
const api = createBackend(readBackend(document), storage);
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
const costs = mountCosts({ ctx, shell });

function render() {
  const section = SECTIONS.find((s) => s.id === shell.section);
  shell.setTitle(section?.label ?? '');
  shell.tools.replaceChildren();
  if (!ctx.payload) {
    const actions = document.createElement('span');
    actions.className = 'empty-state__actions';
    actions.append(
      button({
        label: 'Start a project',
        icon: 'plus',
        variant: 'primary',
        onClick: projects.newProject,
      }),
      button({
        label: 'Load from a file',
        icon: 'upload',
        onClick: projects.importProject,
      }),
    );
    shell.setBody(emptyState('No project open.', { action: actions }));
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
  costs.show();
}

shell.onSection(render);
ctx.on('payload', render);
render();

ctx
  .loadProjects()
  .then((projects) => {
    const last = prefs.read('lastProject');
    const id = projects.find((p) => p.id === last)?.id ?? projects[0]?.id;
    return id ? ctx.openProject(id) : null;
  })
  .catch((error) => toaster.failure(describeFailure(error)));
