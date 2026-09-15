// The project picker in the header: a select of every project plus the
// buttons that start, edit, delete, save, and load one. Deleting closes
// the project first so the refetch after the write has nothing to fetch.
// Loading a file always creates a new project, so a file can be loaded
// twice without touching the project it came from.
import { describeFailure } from '../api/errors.js';
import {
  exportFileName,
  parseExportFile,
  pickJsonFile,
  saveJson,
} from '../storage/exportFile.js';
import { button, iconButton } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import { openProjectDialog } from './projectDialog.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').Project} Project */

/** @typedef {import('../storage/exportFile.js').FileDeps} FileDeps */

/**
 * @param {{ ctx: AppContext, host: HTMLElement, files?: FileDeps }} deps files is the document and URL a test hands in
 */
export function mountProjects({ ctx, host, files }) {
  const el = document.createElement('div');
  el.className = 'picker';

  const label = document.createElement('label');
  label.className = 'sr-only';
  label.htmlFor = 'project-select';
  label.append('Project');
  const select = document.createElement('select');
  select.id = 'project-select';
  select.className = 'field picker__select';
  select.addEventListener('change', () => {
    ctx
      .openProject(select.value)
      .catch((error) => ctx.toaster.failure(describeFailure(error)));
  });

  const edit = iconButton({
    icon: 'pencil',
    label: 'Edit project',
    onClick: editProject,
  });
  const remove = iconButton({
    icon: 'trash',
    label: 'Delete project',
    onClick: deleteProject,
  });
  const save = iconButton({
    icon: 'download',
    label: 'Save project to a file',
    onClick: exportProject,
  });
  const load = iconButton({
    icon: 'upload',
    label: 'Load project from a file',
    onClick: importProject,
  });
  const start = button({
    label: 'New project',
    icon: 'plus',
    variant: 'primary',
    onClick: newProject,
  });
  el.append(label, select, edit, remove, save, load, start);
  host.replaceChildren(el);

  function render() {
    const open = ctx.payload?.project ?? null;
    select.replaceChildren(
      ...ctx.projects.map((project) => {
        const option = document.createElement('option');
        option.value = project.id;
        option.append(project.name);
        option.selected = project.id === open?.id;
        return option;
      }),
    );
    if (open) select.value = open.id;
    const none = ctx.projects.length === 0;
    select.hidden = none;
    for (const control of [edit, remove, save]) {
      control.hidden = none;
      control.disabled = !open;
    }
  }

  function newProject() {
    openProjectDialog({
      async onSave(input) {
        const outcome = await ctx.write((api) => api.createProject(input), {
          done: `Started ${input.name}`,
          reload: true,
        });
        if (outcome.ok) await ctx.openProject(outcome.result.id);
        return outcome;
      },
    });
  }

  function editProject() {
    const project = ctx.payload?.project;
    if (!project) return;
    openProjectDialog({
      project,
      onSave: (input) =>
        ctx.write((api) => api.patchProject(project.id, input), {
          done: `Saved ${input.name}`,
          reload: true,
        }),
    });
  }

  async function deleteProject() {
    const project = ctx.payload?.project;
    if (!project) return;
    const confirmed = await confirmDialog({
      title: `Delete ${project.name}?`,
      message:
        'Every schedule item, note, variance, and material in it goes too. There is no undo.',
    });
    if (!confirmed) return;
    ctx.closeProject();
    const outcome = await ctx.write((api) => api.deleteProject(project.id), {
      done: `Deleted ${project.name}`,
      reload: true,
    });
    const next = outcome.ok ? ctx.projects[0]?.id : project.id;
    if (next) await ctx.openProject(next);
  }

  async function exportProject() {
    const project = ctx.payload?.project;
    if (!project) return;
    try {
      const file = await ctx.api.exportProject(project.id);
      const fileName = exportFileName(project.name, file.exportedAt);
      saveJson(fileName, file, files);
      ctx.toaster.success(`Saved ${fileName}`);
    } catch (error) {
      ctx.toaster.failure(describeFailure(error));
    }
  }

  async function importProject() {
    const picked = await pickJsonFile(files);
    if (!picked) return;
    /** @type {import('../types.ts').ExportFile} */
    let file;
    try {
      file = parseExportFile(await picked.text(), picked.name);
    } catch (error) {
      ctx.toaster.failure(describeFailure(error));
      return;
    }
    const outcome = await ctx.write((api) => api.importProject(file), {
      reload: true,
    });
    if (!outcome.ok) return;
    const { project } = outcome.result;
    await ctx.openProject(project.id);
    ctx.toaster.success(`Loaded ${project.name} from ${picked.name}`);
  }

  ctx.on('projects', render);
  ctx.on('payload', render);
  render();
  return { el, newProject, importProject };
}
