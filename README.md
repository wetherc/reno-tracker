# Renovation Project Tracker

This project tracks home renovation work for one household, as an
alternative to JobTread. A small Node server serves the page and owns one
SQLite database. The browser client is plain HTML, CSS, and JavaScript with
no framework and no runtime dependency. The same client also runs as a
static site on GitHub Pages, where it keeps its data in the browser.

## Features

- A schedule of work. Each item has a title, a description, start and end
  dates, a responsible party, estimated and actual costs, and dependencies
  on other items.
- A change log on every schedule item. The server writes one entry for each
  tracked field that a save changes, with an optional reason.
- Notes on each schedule item, and a Notes section that lists every note
  in the project under the day it was written, newest first. Each note
  names its item, and that name opens the item's editor on its Notes tab.
- A bill of materials for non-labor costs. Each material has an allowance,
  an estimated cost, an actual cost, and an expected day. A material with
  no estimate counts its allowance as its expected cost.
- Invoices. Each invoice has a number, the party that sent it, an issue
  day, an optional due day, and one or more lines. Each line bills one
  schedule item or one material. Each invoice also has a markup rate,
  the project manager's margin, which starts at the rate set on the
  project. Its total is the sum of the lines plus that rate, and the
  editor shows both parts as the lines are typed. A billed row's actual
  cost is the sum of its lines, and its editor shows that sum read only. A row that no
  line bills keeps the actual price typed on it. A billed row cannot be
  deleted until its lines are gone. An invoice edit writes no row to the
  change log.
- Payments on each invoice. A payment has a paid day, an amount, and an
  optional note. A deposit is a payment dated before the issue day. An
  invoice can also hold back retainage, which stays owed but not due
  until a payment covers it. The Invoices section shows what is owed:
  overdue, due next, on invoices with no due day, and held back. Each
  row shows its open balance and its status. An invoice with no due day
  reads Unpaid and is never overdue. Mark paid records the open balance
  as one payment dated today. A payment above the total shows as
  overpaid, and it does not lower what other invoices owe. Payments do
  not change a row's actual cost, which stays the sum of its lines.
- A complete checkbox on every schedule and material row. Every view shares
  it.
- Four views of the schedule: table, calendar, Gantt, and agenda. A tap
  or click on a calendar day lists every item at work that day under
  the grid, which is how a phone reaches items whose bars are too thin
  to tap. A screen under the breakpoint opens on the agenda until a view
  is picked, because the table needs a sideways scroll there.
- A filter bar over every schedule view. The search box matches each
  typed word against the title, description, and responsible party of
  an item. A picker keeps one responsible party, and a status switch
  keeps all items, open items, or late items. A line beside the bar
  counts the items shown out of the total and offers Clear. The status
  is kept between visits. The search text and the party reset when
  another project opens.
- A costs panel with summary tiles, a cumulative cost line against the
  budget, a cost-by-week bar chart, and a table of every line item, labor
  and materials together. A line under the table totals the cost incurred
  but not invoiced, which is the estimate on every complete row with no
  actual price entered yet. The time axis on both charts marks every Sunday
  with its day number and names each month once. Pointing at or tabbing to
  a dot on the line or a bar in the week chart opens a callout with the
  rows that land that day and the running totals, and drops a line from
  the dot to the axis.
- A markup rate on the project, for the project manager's margin. The
  schedule, the materials, and each row's editor show base cost. The
  costs panel adds the markup to every amount. A billed row takes its
  share of the markup on its invoices, at each invoice's rate, and every
  other price takes the row's own rate, or the project rate when the row
  has none. A Projected tile shows the total
  the project is heading for, split into base cost and markup, and the
  headroom tile is the budget less that total. An open row counts the
  larger of its invoiced sum and its estimate, because a first invoice
  is often a deposit. A complete row counts its invoiced sum.
- Save of a project to a JSON file, and load of that file as a new project.
  A loaded project whose name is taken gets the load day in its name, such
  as "Kitchen (loaded Sep 24)". The picker lists projects by name.

## Running

The server needs Node 22.16 or later, because it reads SQLite through the
built-in `node:sqlite` module.

```sh
pnpm install
pnpm dev
```

Then open `http://localhost:3000`. `pnpm dev` restarts the server when a
file under `src/server` changes, and `pnpm start` runs it once. `PORT`
changes the port. The server binds to `127.0.0.1` only, because the app has
no login.

The bind does not stop a hostile web page. The page can point its own
name at `127.0.0.1` and then read every answer. The server therefore
answers 421 to a `Host` header other than `127.0.0.1:<port>` or
`localhost:<port>`, and 403 to a foreign `Origin` header. A POST or PATCH
without `Content-Type: application/json` gets 415, because a cross-site
form can send only other types.

Every answer sends `Content-Security-Policy` with `frame-ancestors
'none'`, so no other site can frame the app and steer a click onto
Delete. The policy loads scripts, styles, and images from the server
only, plus `data:` images for the select arrow in `base.css`. Every
answer also sends `X-Content-Type-Options: nosniff`. GitHub Pages cannot
set response headers, so the static site runs without both.

The server sends only the files that the page loads: `index.html`,
`style.css`, `favicon.svg`, and the files under `styles/` and `src/`
outside `src/server/`. Every other path gets 404. The check compares
lower-case names, because APFS on macOS opens `src/server/index.js` for
`/SRC/Server/index.js`. The server then finds the real path of the file
on disk and checks that path again. This refuses a symlink that points
outside the allowed files, and a name such as `src/ſerver` that APFS
folds to `src/server`.

Each file goes out with `Cache-Control: no-cache`, an `ETag` built from
its size and modification time, and `Last-Modified`. The browser asks
again on every load, and the server answers 304 with no body when the
file has not changed.

| Script               | Runs                                                    |
| -------------------- | ------------------------------------------------------- |
| `pnpm test`          | the unit and server tests                               |
| `pnpm run typecheck` | the type check over every `.js` and `.ts` file          |
| `pnpm lint`          | ESLint and the CSS token check                          |
| `pnpm e2e`           | the Playwright specs, against a server it starts itself |

The pre-commit hook in `.githooks/` runs format, lint, typecheck, and the
unit tests.

## Deploying to GitHub Pages

GitHub Pages serves files only, so the page cannot reach a Node server
there. The static build switches the page to a browser-side data store.
Each project then lives in the browser's `localStorage` under its own
key, `reno-tracker:project:<id>`, on the device and in the browser profile
that wrote it. The Save button in the project picker writes a project to a
JSON file, and Load reads that file back, so a project can move between
the static site and a local server, or between two browsers.

The store parses every project once and keeps the rows in memory, so a
refetch after a write parses nothing. A write stores only the project it
changed. A `storage` event from another tab drops the memory copy. Before
each write the store also compares the stored text of the project with
the text it last saw, and reloads when they differ, so a write in one tab
does not replace a change from another tab.

The browser holds about 5 MB per site, and the change log grows with
every edit. The browser store therefore keeps the newest 50 change rows
of each item and drops older ones. The server keeps every row. Save a
project to a file to keep its full log.

A tab keeps the page code it loaded. A tab that loaded a build with no
invoices reads a stored project without its invoices, and its next
write stores the project with none. Reload every open tab after the
site updates.

A document under the key `reno-tracker:db` keeps many projects in one
key. On load the store moves each of its projects to a key of its own
and removes `reno-tracker:db`. A project that the browser refuses to
store stays in `reno-tracker:db` until the next load.

When the text of a project key does not parse as that project, the store
copies it to `reno-tracker:db-damaged:<id>`, removes the key, and leaves
the project out. A `reno-tracker:db` document that does not parse as a
JSON object is copied to `reno-tracker:db-damaged` in the same way. The
copy stays for recovery by hand. When the copy key already holds a
different damaged copy, or the browser refuses the copy, every action
fails with a message and nothing is written.

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
Node only, so the workflow installs no packages. Each action is pinned to
a commit SHA. Only the deploy job gets the `pages: write` and
`id-token: write` permissions, and checkout keeps no token in the clone.

The Playwright project named `pages` runs `tests/e2e/pages.spec.js`
against the static build with no API. It checks that no request goes to
`/api` and that a project comes back after a reload.

## Architecture

`src/api/backend.js` reads the `reno-backend` meta tag in `index.html`
and returns one of two objects with the same methods. `server` is the
fetch wrapper in `src/api/client.js`, and `local` is `src/local/api.js`,
which runs the same field checks as the routes and throws the same
`ApiError` statuses and messages, so the toasts and field marks read the
same in both modes.

The client fetches one project payload, keeps it in memory as the single
source of truth, and refetches the whole project after every write. A
household project stays under a few hundred rows, so the refetch is
cheaper than patching the client copy and removes a class of drift bugs.
The payload leaves out the change log, because the log gains rows with
every edit and would make each refetch larger. The Changes tab of the
item editor fetches the rows of its item from
`GET /api/schedule/:id/changes` each time it opens, and again after each
write while it is open. Export still includes the whole log.

`ctx.openProject` passes each fetched payload through
`withInvoiceActuals` in `src/costs/invoiced.js`, which sets the actual
price of every billed row to the sum of its invoice lines. That sum is
base cost. `costEvents` in `src/costs/timeline.js` adds the markup for
the costs panel only. Every view,
chart, and total reads that sum with no code of its own. An editor
leaves `actualCents` out of the save for a row that is billed when it
opens or when it saves, so the typed price stays in storage and the
change log records no false change. Export reads the backend, so a saved
file keeps the typed prices.

Every write on the client goes through `ctx.write` in
`src/app/context.js`, which toasts the failure text or the success
sentence and then refetches.

Each refetch rebuilds the panel, so the control that had focus is
replaced. Every control that a rebuild replaces carries a `data-focus`
key that names its row and role, such as `<item id>:complete`.
`src/ui/focusKey.js` reads the key of the focused control before the
rebuild and focuses its match after. A dialog does the same for the
control that opened it. When the match is gone, as after a delete, the
panel title takes focus.

The whole project is plain JavaScript with full typechecking. Types live
in `.ts` files that contain only declarations, and the `.js` files
reference them through JSDoc comments. `tsconfig.json` sets `allowJs` and
`checkJs`, so `pnpm run typecheck` checks every file and emits nothing.
`src/types.ts` defines the domain types that the client and the server
share.

`style.css` is an import manifest. It `@import`s the feature sheets under
`styles/`, base tokens and primitives first and the responsive overrides
last, so one file states the cascade order.

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

An invoice line bills one schedule item or one material. Its link to
that row has no `ON DELETE` action. Both backends answer 409 to a delete
of a billed item or material, such as `Invoice 1043 from Pinch Plumbing
bills Tile. Remove that line first.`, and SQLite refuses the delete if
the check is skipped. So a single delete cannot change an invoice
total. A project delete still removes every row, because SQLite checks
the link at the end of the statement, after the invoices are gone.

The database stores money as integer cents and dates as `YYYY-MM-DD`
strings. One money field takes at most one billion dollars, because
`node:sqlite` throws on a read of an integer above 2^53 and a sum of
many fields has to stay exact. Date math runs on UTC midnight, so daylight saving cannot shift a
day. The server makes every id as a UUID.

A markup rate is an integer count of basis points, where 1500 is 15%.
It runs from 0 to 10000. Integer basis points keep the money math exact,
because a decimal percent such as 0.29 has no exact binary value. The
project and each invoice have a rate of their own. A new invoice with no
rate in its body copies the project rate. A change to the project rate
does not change an invoice that is already entered. A project or
invoice stored with no rate, and an import file with none, reads as 0.
A schedule item or material can also have a rate of its own, for the
markup on its estimate. A row with no rate stores null and takes the
project rate, so a change to the project rate moves every such row. A
change to the rate of a schedule item writes a change log row.

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
  "materials": [],
  "invoices": []
}
```

`POST /api/projects/import` takes the same document and creates a new
project with fresh ids, so a file can be loaded twice without colliding
with the project it came from. Import takes a body of up to 25 MB, and
every other route takes up to 1 MB. Export has no limit, and the change
log grows with every edit, so a saved file can pass 1 MB. Both backends check the document through
`src/entities/importFile.js` first. A bad value answers 400 with the list
and row number, for example `schedule row 3: endDate 2026-01-05 is before
startDate 2026-01-09`. A dependency on itself or a loop of dependencies
also answers 400. A note, change row, or dependency that points at an
item the file does not list is dropped, and so is a second copy of an
edge. A material that points at such an item loses its link. A file
with no `invoices` list loads with no invoices. An invoice line that
bills an item or a material the file does not list answers 400, because
dropping the line would change the invoice total. A material keeps its
file id through the check so a line can name it. The picker's Save and Load buttons call
these two routes. The file name is the project slug plus the export day
in the local time zone.

## UI components

This codebase has no component framework. A component is a plain function
that builds DOM elements and returns a handle, using a
small set of shared builders plus one CSS token file.

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

Never write a fallback such as `var(--border, #ccc)`. A missing token
renders as nothing and shows the typo, while a fallback hides it.
`scripts/check-css-tokens.js` fails the lint when a sheet uses a token that
`base.css` does not define.

Every accent has a `*-contrast` partner, and a filled element always
declares its own foreground color from it. Add new accents as a pair.

Elevation uses `color-mix` to fade `--shadow-tint` to the wanted alpha, so
shadows follow the theme without restating a color.

### Theming

One set of tokens serves both themes. Each color is a single
`light-dark(light, dark)` declaration that the root `color-scheme`
resolves:

- `:root { color-scheme: light dark }` follows the OS preference by
  default.
- `:root[data-theme='light']` and `:root[data-theme='dark']` pin the
  theme. The attribute selector outranks the bare `:root`, so an explicit
  choice always wins.
- `src/ui/ThemeToggle.js` writes `data-theme` on `<html>`, deletes it for
  System, and saves the choice under `reno-tracker:theme`.
- `src/boot.js`, a plain script that `index.html` loads at the top of
  `<body>`, re-applies the saved value before first paint, so a dark-theme
  reload does not flash light.

The one non-color themed value is `--select-chevron`, an inline SVG data
URI. `light-dark()` resolves `<color>` only, so it cannot contain a `url()`.
Instead, a `prefers-color-scheme` block plus the two `data-theme` blocks
swap the arrow, so that token appears four times.

`--overlay-*` is the one exception, pinned dark in both themes because
toasts and tooltips float over the page rather than sit in it.

### Shared classes

Class names follow BEM (block, element, modifier):
`block__element--modifier`. Every feature shares the classes below, which
live in `base.css`. Reuse the class, and keep only layout (margins, grid
placement) in the component's own class.

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
| `.badge` + `--success`/`--danger`/`--neutral`        | a read-only status marker on a list row. A color outside the three shared readings comes from a per-feature modifier             |
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
happens with no media query at all. Grid appears only in tabular content
and the calendar weeks.

`responsive.css` contains every layout media query, and the one breakpoint
is `@media (max-width: 68rem)`. A component that reflows on its own width
uses a container query, not a breakpoint. The calendar grid is the one
example.

A flex child that contains text needs `min-width: 0`, or long content
refuses to shrink. That guard appears many times across the sheets, and a
panel that overflows its column usually lacks it.
