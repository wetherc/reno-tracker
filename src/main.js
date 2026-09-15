// Composition root. Builds the AppContext, mounts the shell, then hands
// the panel to the feature module for the current section.
import { createApi } from './api/client.js';
import { describeFailure } from './api/errors.js';
import { createContext } from './app/context.js';
import { mountProjects } from './app/projects.js';
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

const prefs = createPrefs(browserStorage());
const toaster = createToaster(byId('toasts'));
const ctx = createContext({ api: createApi(), prefs, toaster });

mountTheme(byId('theme-toggle'), prefs);
const projects = mountProjects({ ctx, host: byId('project-picker') });
const shell = mountShell({
  sidebar: byId('sidebar'),
  main: byId('main'),
  prefs,
});

function render() {
  const section = SECTIONS.find((s) => s.id === shell.section);
  shell.setTitle(section?.label ?? '');
  shell.setBody(
    ctx.payload
      ? emptyState(`Nothing in ${ctx.payload.project.name} yet.`)
      : emptyState('No project open.', {
          action: button({
            label: 'Start a project',
            icon: 'plus',
            variant: 'primary',
            onClick: projects.newProject,
          }),
        }),
  );
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
