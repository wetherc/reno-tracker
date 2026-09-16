# Renovation Project Tracker

This project tracks home renovation projects for one household, as an
alternative to JobTread. A small Node server serves the page and owns one
SQLite database. The browser client is plain HTML, CSS, and JavaScript with
no framework and no runtime dependency. The same client also runs as a
static site on GitHub Pages, where it keeps its data in the browser.

## Features

- A schedule of work (items, start date, end date, description, responsible
  party, estimated and actual costs, dependencies)
- A change log on every schedule item. The server writes one entry for each
  tracked field that a save changes, with an optional reason
- User-authored notes on each schedule item
- A bill of materials for non-labor costs (allowance, estimated cost, actual
  cost, expected day). A material with no estimate counts its allowance
  as its expected cost
- A complete checkbox on every schedule and material row, shared by every
  view
- Four views of the schedule: table, calendar, gantt, and agenda
- A costs panel with summary tiles, a cumulative cost line against the
  budget, a cost-by-week bar chart, and a table of every line item,
  labor and materials together. A line under the table totals the cost
  incurred but not invoiced: the estimate on every complete row with no
  actual price entered yet. The time axis marks every Sunday with its
  day number and names each month once, on both charts. Pointing at or
  tabbing to a dot on the line or a week bar opens a callout with the
  rows that land that day and the running totals, and drops a line
  from the dot to the axis
- Save of a project to a JSON file and load of that file as a new project

## Running

The server needs Node 22.16 or later, because it reads SQLite through the
built-in `node:sqlite` module.

```sh
pnpm install
pnpm dev
```

Then open `http://localhost:3000`. `pnpm dev` restarts the server when a
file under `src/server` changes. `pnpm start` runs it once. `PORT` changes
the port. The server binds to `127.0.0.1` only, because the app has no
login.

`pnpm test` runs the unit and server tests, `pnpm run typecheck` checks the
types, `pnpm lint` runs ESLint and the CSS token check, and `pnpm e2e` runs
the Playwright specs against a server it starts itself. The pre-commit hook
in `.githooks/` runs format, lint, typecheck, and the unit tests.

## Deploying to GitHub Pages

GitHub Pages serves files only, so the page cannot reach a Node server
there. The static build switches the page to a browser-side data store.
Every project then lives in the browser's `localStorage` under the key
`reno-tracker:db`, on the one device and in the one browser profile that
wrote it. The Save button in the project picker writes a project to a JSON
file, and Load reads that file back, so a project can move between the
static site and a local server or between two browsers.

```sh
pnpm build:pages   # writes the site to dist/
pnpm serve:pages   # builds, then serves dist/ on http://127.0.0.1:3118
```

`scripts/build-pages.js` copies `index.html`, `style.css`, `favicon.svg`,
`styles/`, and `src/` without `src/server/` into `dist/`, and sets the
`reno-backend` meta tag in the page to `local`. `src/api/backend.js` reads
that tag on load and builds either the fetch client or the browser store.
The paths in `index.html` are relative, so the site works under a project
path such as `/reno-tracker/` as well as at a domain root.

`.github/workflows/pages.yml` runs the build on every push to `main` and
publishes `dist/` with `actions/deploy-pages`. Enable Pages once in the
repository settings with GitHub Actions as the source. The build needs
Node only, so the workflow installs no packages.

The Playwright project named `pages` runs `tests/e2e/pages.spec.js`
against the static build with no API, and checks that no request goes to
`/api` and that a project comes back after a reload.

## Architecture

```
  index.html + style.css
          |
          v
  src/main.js ................ composition root: builds one AppContext,
          |                    mounts the shell, then hands the panel to
          |                    the module for the current section
          v
  src/app/*.js ............... one module per feature area: project
          |                    picker, schedule and its four views,
          |                    materials, costs, editors, shell, theme
     _____|_______________________________________
    |          |            |           |          |
    v          v            v           v          v
  src/ui/    src/schedule/  src/costs/  src/charts/  src/entities/
  DOM        dates, graph,  landing     axes, line   defaults and
  widgets    calendar,      days,       and bar      validation
             gantt, agenda  totals      models       per entity
    |
    v
  src/api/ ................. fetch wrapper, error text, backend picker
  src/storage/ ............. localStorage prefs, file save and load
          |
          |-----------------------------------.
          v  HTTP, JSON under /api            v  static site only
  src/server/ .............. node:http     src/local/ ...... the same
    routes/ repo/ db/        router,         api.js store.js  methods
                             static files,   projects.js      over one
                             one route and   schedule.js      JSON
                             one repo module materials.js     document in
                             per entity,     transfer.js      localStorage
                             SQLite through
                             node:sqlite
```

`src/api/backend.js` reads the `reno-backend` meta tag in `index.html`
and returns one of two objects with the same methods. `server` is the
fetch wrapper in `src/api/client.js`. `local` is `src/local/api.js`,
which runs the same field checks as the routes and throws the same
`ApiError` statuses and messages, so the toasts and field marks read the
same in both modes.

The client fetches one project payload, keeps it in memory as the single
source of truth, and refetches the whole project after every write. A
household project stays under a few hundred rows, so the refetch is
cheaper than patching the client copy and removes a class of drift bugs.

Every write on the client goes through `ctx.write` in
`src/app/context.js`, which toasts the failure text or the success
sentence and then refetches.

The project is written in plain JavaScript and is fully typechecked. Types
live in `.ts` files that contain only declarations, and the `.js` files
reference those types through JSDoc comments. `tsconfig.json` sets `allowJs`
and `checkJs`, so `pnpm run typecheck` checks the whole project and emits
nothing. `src/types.ts` holds the domain types that the client and the
server share.

`style.css` is an import manifest. It `@import`s the feature sheets under
`styles/`, with base tokens and primitives first and the responsive
overrides last, so the cascade order is stated in exactly one place.

### Data persistence

The server keeps every project in one SQLite file. The file defaults to
`./data/reno.sqlite`, relative to the working directory, and the
`RENO_DB_PATH` environment variable overrides it. `data/` is gitignored.

`src/server/db/open.js` opens the file, turns on foreign keys, and runs
the migrations. `schema.sql` creates the `meta` table that stores the
schema version. `migrate.js` then applies each numbered file under
`src/server/db/migrations/` that is newer than the stored version, inside
one transaction, and writes the new version. Every child table declares
`ON DELETE CASCADE`, so deleting a project removes its rows.

Money is stored as integer cents. Dates are stored as `YYYY-MM-DD`
strings, and date math runs on UTC midnight so daylight saving cannot
shift a day. Ids are UUIDs that the server makes.

`GET /api/projects/:id/export` returns the project as one JSON document:

```json
{
  "format": "reno-tracker/1",
  "exportedAt": "2026-09-15T14:02:11.000Z",
  "project": {},
  "schedule": [],
  "dependencies": [],
  "variances": [],
  "notes": [],
  "materials": []
}
```

`POST /api/projects/import` takes the same document and creates a new
project with fresh ids, so a file can be loaded twice without colliding
with the project it came from. The picker's Save and Load buttons call
these two routes. The file name is the project slug plus the export day.

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

| Group            | Tokens                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Surfaces         | `--bg`, `--surface`, `--surface-raised`, `--surface-sunken`                                                    |
| Lines            | `--border`, `--border-strong`                                                                                  |
| Text             | `--text`, `--text-muted`                                                                                       |
| Accents          | `--accent`, `--accent-hover`, `--danger`, `--success`, `--warning`, each with a matching `*-contrast`          |
| Focus and shadow | `--focus-ring`, `--shadow-tint`, `--shadow-1/2/3`                                                              |
| Overlay chrome   | `--overlay-bg`, `--overlay-text`                                                                               |
| Spacing          | `--space-1` (0.25rem) through `--space-6` (2rem)                                                               |
| Type             | `--font-sans`, `--font-mono`, `--text-display`, `--text-heading`, `--text-body`, `--text-label`, `--line-body` |
| Radius           | `--radius-sm`, `--radius`, `--radius-lg`, `--radius-pill`                                                      |
| Motion           | `--transition-press` (40ms), `--transition-fast` (120ms), `--transition-base` (250ms)                          |

The token system depends on these rules:

- **Never write a fallback** (`var(--border, #ccc)`), because a missing
  token renders as nothing and shows the typo, while a fallback hides it.
  `scripts/check-css-tokens.js` fails the lint when a sheet uses a token
  that `base.css` does not define.
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
  for System), and persists the choice under `reno-tracker:theme`.
- `src/boot.js`, a plain script that `index.html` loads at the top of
  `<body>`, re-applies the saved value before first paint, so a dark-theme
  reload does not flash light.

The one non-color themed value is `--select-chevron`, an inline SVG data
URI. `light-dark()` resolves `<color>` only, so it cannot contain a `url()`.
Instead, the arrow is swapped in a `prefers-color-scheme` block plus the
two `data-theme` blocks, so that token appears four times.

`--overlay-*` is the one exception, pinned dark in both themes because
toasts and tooltips float over the page rather than sit in it.

### Shared classes

Class names are BEM-ish: `block__element--modifier`. Everything below
lives in `base.css` and is shared across features. Reuse the class, and
keep only layout (margins, grid placement) in the component's own class.

| Class                                                | Role                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `.btn` + `--primary`/`--danger`/`--success`/`--icon` | every button, built through `buttons.js`                                                                                         |
| `.btn-bare`                                          | the reset for a control that is a button with no button chrome, built through `bareButton`                                       |
| `.field`                                             | every input, select, and textarea                                                                                                |
| `.form`, `__row`, `__label`, `__wide`, `__number`    | the inline authoring form and its parts, built through `formFields.js`                                                           |
| `.card`, `.card__title`                              | a bordered panel with an uppercase heading                                                                                       |
| `.seg-switch`, `__btn`, `__btn--active`              | segmented toggle (view switcher, theme)                                                                                          |
| `.row-select`, `--current`                           | selectable full-width list row (project picker, section nav)                                                                     |
| `.data-table` and its parts                          | the sortable table with a footer row (schedule row, materials), built through `DataTable.js`                                     |
| `.section-label`                                     | in-panel sub-heading: uppercase, tracked, muted, built through `sectionLabel`                                                    |
| `.empty-state`, `__actions`                          | the "nothing here yet" paragraph and its buttons. The class sets margin, padding, and italic only. `emptyState()` adds `u-muted` |
| `.chip`, `.chip__remove`                             | a small labeled tag, with or without an x, built through `buttons.js`                                                            |
| `.badge` + `--success`/`--danger`/`--neutral`        | a read-only status marker on a list row. A colour outside the three shared readings comes from a per-feature modifier            |
| `.icon`                                              | the SVG wrapper that `icon()` applies                                                                                            |
| `.tabs`, `__tab`, `__panel`                          | a tab strip over a stack of panels (the item editor)                                                                             |
| `.modal` and its parts                               | the native `<dialog>`, built through `Modal.js`                                                                                  |
| `.toast-region`, `.toast` + `--success`/`--danger`   | the write feedback in the corner, built through `Toast.js`                                                                       |
| `.sr-only`                                           | visually hidden, still announced                                                                                                 |

More shared widgets live one sheet up in `widgets.css`, next to the widget
they were built for: `.disclosure` / `__chevron` / `--open`,
`.stat-bar` / `__track` / `__fill` / `--over`, `.fact-line` / `__label` /
`__value` / `--row`, and `.chip-list`.

### Layout and responsiveness

Layout is flex-dominant with intrinsic sizing (`min()`,
`flex: 1 1 <rem basis>`, `repeat(auto-fit, minmax(...))`), so most reflow
happens with no media query at all. Grid is reserved for tabular content
and the calendar weeks.

Because reflow is intrinsic, the few things that do switch on state are
centralized:

- **All layout media queries live in `responsive.css`**, and there is
  exactly one breakpoint: `@media (max-width: 68rem)`.
- **A component that reflows on its own width uses a container query,
  not a breakpoint.** The calendar grid is the one example.

A flex child that contains text needs `min-width: 0`, or long content
refuses to shrink. That guard appears many times across the sheets, and it
is the usual explanation for a panel that overflows its column.

### Accessibility

- Every interactive element is a `<button>`, `<a>`, or form control.
- Every field has a `<label>`. Error text is linked through
  `aria-describedby`.
- `Modal.js` traps focus, restores focus on close, and closes on Escape.
- Gantt bars and handles answer the arrow keys: one day per press, seven
  with Shift.
- Each chart has a `<title>`, and its numbers are also in a table: the
  line items table under the cumulative chart, and a visually hidden twin
  of the week chart. The hover targets over a chart are buttons named
  with their numbers, so the arrow keys walk them and a screen reader
  hears each one as focus lands on it.
- Colour alone never marks state. A complete row also strikes through its
  title and shows a checkmark.
