// Notes on one schedule item: a box to write a new one, then the list
// with edit and delete on each. An edit swaps the body for a textarea in
// place so the other notes stay in view.
import { formatMoment } from '../format/date.js';
import { button, iconButton } from '../ui/buttons.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import { emptyState } from '../ui/emptyState.js';
import { form, formActions, textArea } from '../ui/formFields.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').Note} Note */

let counter = 0;

/**
 * @param {{ ctx: AppContext, itemId: string, notes: Note[] }} config
 * @returns {{ el: HTMLDivElement, update(notes: Note[]): void }}
 */
export function notesList({ ctx, itemId, notes }) {
  const prefix = `notes-${++counter}`;
  const el = document.createElement('div');
  el.className = 'notes';

  const draft = textArea({
    id: `${prefix}-draft`,
    label: 'New note',
    placeholder: 'What happened, what was decided, who said so.',
  });
  const add = button({ label: 'Add note', variant: 'primary', type: 'submit' });
  const composer = form({ ariaLabel: 'Write a note', onSubmit: submitDraft });
  composer.append(draft.el, formActions([add]));

  const list = document.createElement('ul');
  list.className = 'notes__list';
  list.setAttribute('aria-label', 'Notes');
  el.append(composer, list);

  async function submitDraft() {
    const body = draft.input.value.trim();
    if (!body) {
      draft.setError('Write something first.');
      return;
    }
    draft.setError(null);
    add.disabled = true;
    const outcome = await ctx.write((api) => api.addNote(itemId, body), {
      done: 'Note added',
    });
    add.disabled = false;
    if (outcome.ok) draft.input.value = '';
  }

  /** @param {Note} note */
  function renderNote(note) {
    const li = document.createElement('li');
    li.className = 'note';
    const meta = document.createElement('div');
    meta.className = 'note__meta';
    const when = document.createElement('time');
    when.className = 'note__when u-muted';
    when.setAttribute('datetime', note.createdAt);
    when.append(
      note.updatedAt === note.createdAt
        ? formatMoment(note.createdAt)
        : `${formatMoment(note.createdAt)}, edited`,
    );
    const body = document.createElement('p');
    body.className = 'note__body';
    body.append(note.body);

    const edit = iconButton({
      icon: 'pencil',
      label: 'Edit note',
      onClick: () => startEdit(li, note, body, meta),
    });
    const remove = iconButton({
      icon: 'trash',
      label: 'Delete note',
      onClick: async () => {
        const yes = await confirmDialog({
          title: 'Delete this note?',
          message: note.body,
        });
        if (!yes) return;
        await ctx.write((api) => api.deleteNote(note.id), {
          done: 'Note deleted',
        });
      },
    });
    meta.append(when, edit, remove);
    li.append(meta, body);
    return li;
  }

  /**
   * @param {HTMLLIElement} li
   * @param {Note} note
   * @param {HTMLParagraphElement} body
   * @param {HTMLDivElement} meta
   */
  function startEdit(li, note, body, meta) {
    const field = textArea({
      id: `${prefix}-edit-${note.id}`,
      label: 'Edit note',
      value: note.body,
    });
    const save = button({ label: 'Save', variant: 'primary', type: 'submit' });
    const cancel = button({ label: 'Cancel', onClick: () => restore() });
    const editor = form({
      ariaLabel: 'Edit note',
      onSubmit: async () => {
        const text = field.input.value.trim();
        if (!text) {
          field.setError('A note cannot be blank. Delete it instead.');
          return;
        }
        save.disabled = true;
        const outcome = await ctx.write((api) => api.patchNote(note.id, text), {
          done: 'Note saved',
        });
        save.disabled = false;
        if (outcome.ok) restore();
      },
    });
    editor.append(field.el, formActions([cancel, save]));
    meta.hidden = true;
    body.replaceWith(editor);
    field.input.focus();

    function restore() {
      editor.replaceWith(body);
      meta.hidden = false;
    }
  }

  /** @param {Note[]} next */
  function update(next) {
    const mine = next.filter((n) => n.scheduleItemId === itemId);
    const newestFirst = [...mine].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    list.replaceChildren(...newestFirst.map(renderNote));
    list.hidden = mine.length === 0;
    el.querySelector('.empty-state')?.remove();
    if (mine.length === 0) el.append(emptyState('No notes on this item yet.'));
  }

  update(notes);
  return { el, update };
}
