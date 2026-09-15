# Renovation Project Tracker

This project is designed to track home renovation projects, as an alternative to JobTread.

## Features

This project's main functions include:

- A schedule of work (items, start date, end date, description, responsible party, estimated and actual costs, dependencies/dependents)
- Variance logs to any items on the schedule of work (changes to dates, costs, scope of work, etc.)
- User-authored notes on each item in the schedule of work
- A bill of materials for non-labor-related costs (allowance, estimated cost, actual cost)
- The ability to mark all BOM and schedule items complete/incomplete
- Flexible displays of the work calendar (calendar view, gannt chart, agenda list, etc.)
- Visual display of cost over time (when costs are expected to hit, cumulative cost against budget, etc.)

## Architecture

```
  index.html + style.css
          |
          v
  src/main.js ................ composition root: builds one AppContext,
          |                    then calls each wiring module in order
          v
  src/app/*.js ............... wiring modules, one per feature area;
          |                    mount panels, register views and actions,
          |                    keep per-feature UI state
     _____|______________________________
    |            |            |          |
    v            v            v          v
  src/ui/      src/map/    src/entities/  src/dice/, src/party/,
  DOM widgets  canvas +    pure data      src/library/, src/campaign/
  (panels,     pure map    models         (more pure logic)
  dialogs,     logic
  forms)          |
                  v
             src/storage/ ..... serialization, localStorage,
                                file export/import, undo history
```

The project is written in plain JavaScript and is fully typechecked. Types
live in `.ts` files that contain only declarations, and the `.js` files
reference those types through JSDoc comments. `tsconfig.json` sets `allowJs`
and `checkJs`, so `pnpm run typecheck` checks the whole project and emits
nothing.

`style.css` is an import manifest. It `@import`s the feature sheets under
`styles/`, with base tokens and primitives first and the responsive overrides
last, so the cascade order is stated in exactly one place.

### Data persistence

App data is persisted to a SQLite database.

## UI components

This codebase has no component framework: a component here is a plain
function that builds DOM elements and returns a handle, and the consistency
comes from a small set of shared builders plus one CSS token file.

Read this guide before you add anything to `src/ui/` or `styles/`, because
almost every widget pattern that you need already exists, and a hand-rolled
copy of one tends to miss the accessibility attributes that the shared
builder sets.

### Tokens

Every color, space, radius, type size, and shadow is a custom property
defined in one `:root` block in `styles/base.css`:

| Group            | Tokens                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Surfaces         | `--bg`, `--surface`, `--surface-raised`, `--surface-sunken`                                                     |
| Lines            | `--border`, `--border-strong`                                                                                   |
| Text             | `--text`, `--text-muted`                                                                                        |
| Accents          | `--accent`, `--accent-hover`, `--danger`, `--success`, `--warning`, `--mana`, each with a matching `*-contrast` |
| Focus and shadow | `--focus-ring`, `--shadow-tint`, `--shadow-1/2/3`                                                               |
| Over-map chrome  | `--overlay-bg`, `--overlay-text`, `--overlay-npc`                                                               |
| Spacing          | `--space-1` (0.25rem) through `--space-6` (2rem)                                                                |
| Type             | `--font-sans`, `--font-mono`, `--text-display`, `--text-heading`, `--text-body`, `--text-label`, `--line-body`  |
| Radius           | `--radius-sm`, `--radius`, `--radius-lg`, `--radius-pill`                                                       |
| Motion           | `--transition-press` (40ms), `--transition-fast` (120ms), `--transition-base` (250ms)                           |

The token system depends on these rules:

- **Never write a fallback** (`var(--border, #ccc)`), because a missing
  token renders as nothing and shows the typo, while a fallback hides it.
- **Every accent has a `*-contrast` partner**, and a filled element always
  declares its own foreground color from it. Add new accents as a pair.

Elevation uses `color-mix` to fade `--shadow-tint` to the wanted alpha, so
shadows follow the theme without restating a color.

### Theming

There is one set of tokens. Each color is a single
`light-dark(light, dark)` declaration resolved by the root `color-scheme`:

- `:root { color-scheme: light dark }` follows the OS preference by
  default.
- `:root[data-theme='light']` and `:root[data-theme='dark']` pin the
  theme. The attribute selector outranks the bare `:root`, so an explicit
  choice always wins.
- `src/ui/ThemeToggle.js` writes `data-theme` on `<html>` (and deletes it
  for System), and persists the choice under `campaign-builder:theme`.
- `src/boot.js`, a plain script that `index.html` loads at the top of
  `<body>`, re-applies the saved value before first paint, so a dark-theme
  reload does not flash light.

The one non-color themed value is `--select-chevron`, an inline SVG data
URI. `light-dark()` resolves `<color>` only, so it cannot contain a `url()`.
Instead, the arrow is swapped in a `prefers-color-scheme` block plus the
two `data-theme` blocks, so that token appears four times.

`--overlay-*` is the one exception, pinned dark in both themes because map
controls, toasts, tooltips, and the onboarding scrim float over map art
rather than the page background.

### Shared classes

Class names are BEM-ish: `block__element--modifier`. Everything below
lives in `base.css` and is shared across features. Reuse the class, and
keep only layout (margins, grid placement) in the component's own class.

| Class                                                | Role                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `.btn` + `--primary`/`--danger`/`--success`/`--icon` | every button, built through `buttons.js`                                                                                                |
| `.btn-bare`                                          | the reset for a control that is a button with no button chrome, built through `bareButton`                                              |
| `.field`                                             | every input, select, and textarea                                                                                                       |
| `.form`, `__row`, `__label`, `__wide`, `__number`    | the inline authoring form and its parts, built through `formFields.js`                                                                  |
| `.card`, `.card__title`                              | a bordered panel with an uppercase heading                                                                                              |
| `.seg-switch`, `__btn`, `__btn--active`              | segmented toggle (mode, theme, role, dice-tray d20)                                                                                     |
| `.row-select`, `--current`                           | selectable full-width list row (world tree, roster)                                                                                     |
| `.section-label`                                     | in-panel sub-heading: uppercase, tracked, muted, built through `sectionLabel`                                                           |
| `.empty-state`                                       | the "nothing here yet" paragraph. The class sets margin, padding, and italic only. `emptyState()` adds `u-muted` for the color and size |
| `.chip`, `.chip__remove`                             | a small labeled tag, with or without an x, built through `buttons.js`                                                                   |
| `.badge` + `--success`/`--danger`/`--neutral`        | a read-only status marker on a list row. A colour outside the three shared readings comes from a per-feature modifier                   |
| `.icon`                                              | the SVG wrapper that `icon()` applies                                                                                                   |
| `.tabs`, `__tab`, `__panel`                          | a tab strip over a stack of panels                                                                                                      |
| `.modal` and its parts                               | the native `<dialog>`, built through `Modal.js`                                                                                         |
| `.sr-only`                                           | visually hidden, still announced                                                                                                        |

More shared widgets live one sheet up in `widgets.css`, next to the widget
they were built for: `.disclosure` / `__chevron` /
`--open`, `.stat-bar` / `__track` / `__fill` / `.fact-line` / `__label` /
`__value` / `--row`.

### Layout and responsiveness

Layout is flex-dominant with intrinsic sizing (`min()`,
`flex: 1 1 <rem basis>`, `repeat(auto-fit, minmax(...))`), so most reflow
happens with no media query at all. Grid is reserved for tabular
content.

Because reflow is intrinsic, the few things that do switch on state are
centralized:

- **All layout media queries live in `responsive.css`**, and there is
  exactly one breakpoint: `@media (max-width: 68rem)`.
- **A component that reflows on its own width uses a container query,
  not a breakpoint.**

A flex child that contains text needs `min-width: 0`, or long content
refuses to shrink. That guard appears over twenty times across the
sheets, and it is the usual explanation for a panel that overflows its
column.
