// What the panel shows while no project is open. A loading line shows
// while the project list is on its way, and the failure with a Retry
// button shows when it does not come. The invitation to start or load a
// project shows only once an empty list arrives, because its buttons
// need a working backend too.
import { button } from '../ui/buttons.js';
import { emptyState } from '../ui/emptyState.js';
import { focusKey } from '../ui/focusKey.js';

/**
 * @typedef {{ kind: 'loading' }
 *   | { kind: 'error', message: string }
 *   | { kind: 'ready' }} StartState
 */

/**
 * @param {StartState} state
 * @param {{ onRetry: () => void, onNew: () => void, onLoad: () => void }} actions
 * @returns {HTMLElement}
 */
export function startView(state, { onRetry, onNew, onLoad }) {
  if (state.kind === 'loading') {
    const el = emptyState('Loading projects…');
    el.setAttribute('role', 'status');
    return el;
  }
  if (state.kind === 'error') {
    const el = emptyState(`Could not load the projects. ${state.message}`, {
      action: focusKey(
        button({ label: 'Retry', variant: 'primary', onClick: onRetry }),
        'start:retry',
      ),
    });
    el.setAttribute('role', 'alert');
    return el;
  }
  const actions = document.createElement('span');
  actions.className = 'empty-state__actions';
  // A new or loaded project replaces this panel, so these keys find no
  // match after the write. The panel title then takes focus.
  actions.append(
    focusKey(
      button({
        label: 'Start a project',
        icon: 'plus',
        variant: 'primary',
        onClick: onNew,
      }),
      'start:new',
    ),
    focusKey(
      button({ label: 'Load from a file', icon: 'upload', onClick: onLoad }),
      'start:load',
    ),
  );
  return emptyState('No project open.', { action: actions });
}
