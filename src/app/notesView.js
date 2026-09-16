// The notes section: every note in the project on one page, read as a
// diary. Notes sit under the day they were written, newest first. Each
// one names its schedule item, and that name opens the item's editor on
// the Notes tab, where the note can be edited or deleted.
import { formatDayLong, formatTime } from '../format/date.js';
import { notesByDay } from '../notes/byDay.js';
import { bareButton, button } from '../ui/buttons.js';
import { emptyState } from '../ui/emptyState.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../notes/byDay.js').NoteDay} NoteDay */
/** @typedef {import('../notes/byDay.js').NoteEntry} NoteEntry */

/**
 * @param {{ ctx: AppContext, shell: Shell }} deps
 * @returns {{ show(): void }} show fills the panel with the notes
 */
export function mountNotes({ ctx, shell }) {
  function show() {
    const payload = ctx.payload;
    if (!payload) return;
    shell.tools.replaceChildren();
    shell.setBody(render(payload));
  }

  /** @param {ProjectPayload} payload */
  function render(payload) {
    const days = notesByDay(payload.notes, payload.schedule);
    if (days.length === 0) {
      return emptyState(
        'No notes yet. A note lives on a schedule item, so open one to write the first.',
        {
          action: button({
            label: 'Open the schedule',
            icon: 'calendar',
            onClick: () => shell.setSection('schedule'),
          }),
        },
      );
    }
    const root = document.createElement('ol');
    root.className = 'notes-view';
    root.setAttribute('aria-label', `Notes on ${payload.project.name}`);
    root.append(...days.map(dayEntry));
    return root;
  }

  /** @param {NoteDay} day */
  function dayEntry(day) {
    const li = document.createElement('li');
    li.className = 'notes-day';
    const heading = document.createElement('h2');
    heading.className = 'notes-day__date';
    heading.textContent = formatDayLong(day.date);
    const list = document.createElement('ul');
    list.className = 'notes-day__list';
    list.setAttribute('aria-label', `Notes on ${formatDayLong(day.date)}`);
    list.append(...day.entries.map(noteEntry));
    li.append(heading, list);
    return li;
  }

  /** @param {NoteEntry} entry */
  function noteEntry({ note, item }) {
    const li = document.createElement('li');
    li.className = 'note';
    const meta = document.createElement('div');
    meta.className = 'note__meta';
    const open = bareButton({
      className: 'note__item',
      children: [item.title],
      onClick: () => openScheduleEditor({ ctx, item, tab: 'notes' }),
    });
    meta.append(open);
    if (item.responsibleParty) {
      const party = document.createElement('span');
      party.className = 'note__party u-muted';
      party.textContent = item.responsibleParty;
      meta.append(party);
    }
    const when = document.createElement('time');
    when.className = 'note__when note__when--end u-muted';
    when.setAttribute('datetime', note.createdAt);
    when.textContent =
      note.updatedAt === note.createdAt
        ? formatTime(note.createdAt)
        : `${formatTime(note.createdAt)}, edited`;
    meta.append(when);
    const body = document.createElement('p');
    body.className = 'note__body';
    body.textContent = note.body;
    li.append(meta, body);
    return li;
  }

  return { show };
}
