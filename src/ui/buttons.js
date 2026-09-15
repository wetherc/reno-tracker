// Every button in the app comes from one of these builders so the class,
// type, and accessible name are never left off.
import { icon } from './icon.js';

/** @typedef {'default' | 'primary' | 'danger' | 'success'} ButtonVariant */

/**
 * @typedef {{
 *   label: string,
 *   onClick?: (event: MouseEvent) => void,
 *   variant?: ButtonVariant,
 *   icon?: string,
 *   type?: 'button' | 'submit',
 *   disabled?: boolean,
 *   title?: string,
 * }} ButtonOptions
 */

/**
 * A labeled button, with an optional icon before the text.
 * @param {ButtonOptions} options
 * @returns {HTMLButtonElement}
 */
export function button({
  label,
  onClick,
  variant = 'default',
  icon: iconName,
  type = 'button',
  disabled = false,
  title,
}) {
  const el = document.createElement('button');
  el.type = type;
  el.className = variant === 'default' ? 'btn' : `btn btn--${variant}`;
  el.disabled = disabled;
  if (title) el.title = title;
  if (iconName) el.append(icon(iconName));
  el.append(label);
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

/**
 * An icon-only button. The label becomes the accessible name and the
 * tooltip.
 * @param {{ icon: string, label: string, onClick?: (event: MouseEvent) => void, variant?: ButtonVariant, disabled?: boolean }} options
 * @returns {HTMLButtonElement}
 */
export function iconButton({
  icon: iconName,
  label,
  onClick,
  variant = 'default',
  disabled = false,
}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className =
    variant === 'default' ? 'btn btn--icon' : `btn btn--icon btn--${variant}`;
  el.disabled = disabled;
  el.title = label;
  el.setAttribute('aria-label', label);
  el.append(icon(iconName));
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

/**
 * A button with no button chrome, for text or a row that acts on click.
 * @param {{ label?: string, ariaLabel?: string, className?: string, onClick?: (event: MouseEvent) => void, children?: (Node | string)[] }} options
 * @returns {HTMLButtonElement}
 */
export function bareButton({
  label,
  ariaLabel,
  className,
  onClick,
  children = [],
}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className ? `btn-bare ${className}` : 'btn-bare';
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  if (label !== undefined) el.append(label);
  el.append(...children);
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

/**
 * A small labeled tag. With onRemove it gets an x button named after the
 * label.
 * @param {string} label
 * @param {{ onRemove?: () => void }} [options]
 * @returns {HTMLSpanElement}
 */
export function chip(label, { onRemove } = {}) {
  const el = document.createElement('span');
  el.className = 'chip';
  el.append(label);
  if (onRemove) {
    el.append(
      bareButton({
        className: 'chip__remove',
        ariaLabel: `Remove ${label}`,
        children: [icon('x')],
        onClick: onRemove,
      }),
    );
  }
  return el;
}
