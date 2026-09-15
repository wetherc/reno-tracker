// The checkbox that marks one schedule item done or reopens it. Every
// view that lists items shares it so the label, the disabled state
// during the write, and the rollback on failure stay the same.

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */

/**
 * @param {{ ctx: AppContext, item: ScheduleItem }} deps
 * @returns {HTMLInputElement}
 */
export function completeToggle({ ctx, item }) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'check';
  box.checked = item.complete;
  box.setAttribute(
    'aria-label',
    item.complete ? `Reopen ${item.title}` : `Mark ${item.title} complete`,
  );
  box.addEventListener('change', async () => {
    box.disabled = true;
    const next = box.checked;
    const outcome = await ctx.write(
      (api) => api.setScheduleComplete(item.id, next),
      {
        done: next ? `Marked ${item.title} complete` : `Reopened ${item.title}`,
      },
    );
    if (!outcome.ok) {
      box.checked = item.complete;
      box.disabled = false;
    }
  });
  return box;
}
