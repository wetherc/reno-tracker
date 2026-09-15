// The links of one schedule item. "Waits on" lists the items that have
// to finish first, each with the free days between, and a picker to add
// one more. "Holds up" lists the items that wait on this one. A link
// that would make a loop comes back from the server as a 409, and the
// message walks the loop by title under the picker.
import { ApiError } from '../api/errors.js';
import { gapDays } from '../schedule/dates.js';
import { button, iconButton } from '../ui/buttons.js';
import { emptyState } from '../ui/emptyState.js';
import { form, selectField } from '../ui/formFields.js';
import { sectionLabel } from '../ui/sectionLabel.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

let counter = 0;

/**
 * Words for the free days between a predecessor's end and a successor's
 * start.
 * @param {ScheduleItem} predecessor
 * @param {ScheduleItem} successor
 * @returns {{ text: string, overlap: boolean }}
 */
export function describeGap(predecessor, successor) {
  const gap = gapDays(predecessor.endDate, successor.startDate);
  if (gap < 0) {
    const n = -gap;
    return {
      text: `overlaps by ${n} ${n === 1 ? 'day' : 'days'}`,
      overlap: true,
    };
  }
  if (gap === 0) return { text: 'back to back', overlap: false };
  return { text: `${gap} ${gap === 1 ? 'day' : 'days'} free`, overlap: false };
}

/**
 * @param {{ ctx: AppContext, item: ScheduleItem }} config
 * @returns {{ el: HTMLDivElement, update(payload: ProjectPayload): void }}
 */
export function dependencyLinks({ ctx, item }) {
  const prefix = `links-${++counter}`;
  const el = document.createElement('div');
  el.className = 'links';

  const waitsOn = document.createElement('ul');
  waitsOn.className = 'links__list';
  waitsOn.setAttribute('aria-label', 'Waits on');
  const holdsUp = document.createElement('ul');
  holdsUp.className = 'links__list';
  holdsUp.setAttribute('aria-label', 'Holds up');
  const waitsEmpty = emptyState('Waits on nothing. It can start any time.');
  const holdsEmpty = emptyState('Nothing waits on this item.');

  /** @type {ReturnType<typeof selectField> | null} */
  let picker = null;
  const link = button({ label: 'Link', icon: 'link', type: 'submit' });
  const pickerForm = form({ ariaLabel: 'Add a predecessor', onSubmit: add });
  pickerForm.classList.add('links__picker');

  el.append(
    sectionLabel('Waits on'),
    waitsOn,
    waitsEmpty,
    pickerForm,
    sectionLabel('Holds up'),
    holdsUp,
    holdsEmpty,
  );

  /** @param {ProjectPayload} next */
  function update(next) {
    const byId = new Map(next.schedule.map((s) => [s.id, s]));
    const me = byId.get(item.id) ?? item;
    const mine = next.dependencies.filter(
      (d) => d.successorId === me.id || d.predecessorId === me.id,
    );
    const before = mine.filter((d) => d.successorId === me.id);
    const after = mine.filter((d) => d.predecessorId === me.id);

    waitsOn.replaceChildren(
      ...before.flatMap((d) => {
        const other = byId.get(d.predecessorId);
        return other ? [row(other, describeGap(other, me), d.id)] : [];
      }),
    );
    holdsUp.replaceChildren(
      ...after.flatMap((d) => {
        const other = byId.get(d.successorId);
        return other ? [row(other, describeGap(me, other))] : [];
      }),
    );
    waitsOn.hidden = before.length === 0;
    waitsEmpty.hidden = before.length > 0;
    holdsUp.hidden = after.length === 0;
    holdsEmpty.hidden = after.length > 0;

    const linked = new Set(
      mine.flatMap((d) => [d.predecessorId, d.successorId]),
    );
    const choices = next.schedule.filter(
      (s) => s.id !== me.id && !linked.has(s.id),
    );
    const previous = picker?.input.value;
    picker = selectField({
      id: `${prefix}-pick`,
      label: 'Has to finish first',
      options: choices.map((s) => ({ value: s.id, label: s.title })),
      value: choices.some((s) => s.id === previous) ? previous : choices[0]?.id,
    });
    pickerForm.replaceChildren(picker.el, link);
    pickerForm.hidden = choices.length === 0;
  }

  /**
   * @param {ScheduleItem} other
   * @param {{ text: string, overlap: boolean }} gap
   * @param {string} [dependencyId] set on a link this item can remove
   */
  function row(other, gap, dependencyId) {
    const li = document.createElement('li');
    li.className = 'link-row';
    const title = document.createElement('span');
    title.className = 'link-row__title';
    title.append(other.title);
    const badge = document.createElement('span');
    badge.className = gap.overlap ? 'badge badge--danger' : 'badge';
    badge.append(gap.text);
    li.append(title, badge);
    if (dependencyId) {
      li.append(
        iconButton({
          icon: 'x',
          label: `Unlink ${other.title}`,
          onClick: async () => {
            await ctx.write((api) => api.deleteDependency(dependencyId), {
              done: `${item.title} no longer waits on ${other.title}`,
            });
          },
        }),
      );
    }
    return li;
  }

  async function add() {
    if (!picker) return;
    const predecessorId = picker.input.value;
    const chosen = ctx.payload?.schedule.find((s) => s.id === predecessorId);
    if (!chosen) return;
    picker.setError(null);
    link.disabled = true;
    const outcome = await ctx.write(
      (api) =>
        api.addDependency(item.projectId, {
          predecessorId,
          successorId: item.id,
        }),
      { done: `${item.title} now waits on ${chosen.title}` },
    );
    link.disabled = false;
    if (!outcome.ok && outcome.error instanceof ApiError) {
      picker?.setError(outcome.error.message);
    }
  }

  if (ctx.payload) update(ctx.payload);
  return { el, update };
}
