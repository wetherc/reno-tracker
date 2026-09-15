// Asks one yes-or-no question before a delete. Resolves true only when
// the confirm button is pressed; Escape, the x, and Cancel resolve false.
import { button } from './buttons.js';
import { modal } from './Modal.js';

/**
 * @param {{ title: string, message: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} config
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
}) {
  return new Promise((resolve) => {
    let confirmed = false;
    const text = document.createElement('p');
    text.append(message);
    const dialog = modal({
      title,
      body: [text],
      actions: [
        button({ label: cancelLabel, onClick: () => dialog.close() }),
        button({
          label: confirmLabel,
          variant: danger ? 'danger' : 'primary',
          onClick: () => {
            confirmed = true;
            dialog.close();
          },
        }),
      ],
      onClose() {
        dialog.el.remove();
        resolve(confirmed);
      },
    });
    document.body.append(dialog.el);
    dialog.open();
  });
}
