// The one SVG element builder the charts share.

const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {...(Element | string)} children
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs = {}, ...children) {
  const el = /** @type {SVGElement} */ (document.createElementNS(NS, tag));
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, String(value));
  }
  el.append(...children);
  return el;
}

/**
 * The frame every chart shares: the root svg with its title, one
 * horizontal grid line and label per money tick, and the baseline.
 * @param {{ width: number, height: number, plot: { x: number, y: number, width: number, height: number }, yTicks: { y: number, label: string }[] }} model
 * @param {string} title read by a screen reader
 * @returns {{ svg: SVGElement, titleId: string }}
 */
export function chartFrame(model, title) {
  const titleId = `chart-${Math.random().toString(36).slice(2, 8)}`;
  const svg = svgEl(
    'svg',
    {
      class: 'chart',
      viewBox: `0 0 ${model.width} ${model.height}`,
      role: 'img',
      'aria-labelledby': titleId,
      focusable: 'false',
    },
    svgEl('title', { id: titleId }, title),
  );
  const right = model.plot.x + model.plot.width;
  for (const tick of model.yTicks) {
    svg.append(
      svgEl('line', {
        class: 'chart__grid',
        x1: model.plot.x,
        x2: right,
        y1: tick.y,
        y2: tick.y,
      }),
      svgEl(
        'text',
        {
          class: 'chart__tick',
          x: model.plot.x - 8,
          y: tick.y,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
        },
        tick.label,
      ),
    );
  }
  const floor = model.plot.y + model.plot.height;
  svg.append(
    svgEl('line', {
      class: 'chart__axis',
      x1: model.plot.x,
      x2: right,
      y1: floor,
      y2: floor,
    }),
  );
  return { svg, titleId };
}
