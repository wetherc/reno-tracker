// Every note in a project, read as one diary. Notes group under the local
// day they were written on, newest day first and newest note first inside
// a day. Each entry keeps the schedule item it belongs to, so a reader
// sees who the note is about without opening the item.

/** @typedef {import('../types.ts').Note} Note */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */

/** @typedef {{ note: Note, item: ScheduleItem }} NoteEntry */
/** @typedef {{ date: string, entries: NoteEntry[] }} NoteDay date is YYYY-MM-DD */

const DAY_KEY = new Map();

/**
 * The calendar day a timestamp lands on in one time zone. Two notes
 * written on the same evening stay together even when one of them
 * crosses midnight in UTC.
 * @param {string} iso full ISO 8601 timestamp
 * @param {string} [timeZone] IANA zone; the browser's zone when omitted
 * @returns {string} YYYY-MM-DD
 */
export function localDayOf(iso, timeZone) {
  const key = timeZone ?? '';
  let format = DAY_KEY.get(key);
  if (!format) {
    // en-CA prints numeric dates as YYYY-MM-DD.
    format = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    });
    DAY_KEY.set(key, format);
  }
  return format.format(new Date(iso));
}

/**
 * A note whose item is missing from the schedule is dropped, because
 * there is no title to read it under and no editor to open it in.
 * @param {Note[]} notes
 * @param {ScheduleItem[]} schedule
 * @param {{ timeZone?: string }} [options]
 * @returns {NoteDay[]}
 */
export function notesByDay(notes, schedule, { timeZone } = {}) {
  const items = new Map(schedule.map((item) => [item.id, item]));
  /** @type {Map<string, NoteEntry[]>} */
  const days = new Map();
  const newestFirst = [...notes].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  for (const note of newestFirst) {
    const item = items.get(note.scheduleItemId);
    if (!item) continue;
    const date = localDayOf(note.createdAt, timeZone);
    const entries = days.get(date);
    if (entries) entries.push({ note, item });
    else days.set(date, [{ note, item }]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, entries }));
}
