-- Domain tables. Column names match the field names in src/types.ts so a
-- row reads straight into an entity without a rename step. Booleans are
-- stored as 0 or 1. Money is whole cents. Dates are YYYY-MM-DD text.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  budgetCents INTEGER NOT NULL DEFAULT 0,
  startDate TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE schedule_items (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  responsibleParty TEXT NOT NULL DEFAULT '',
  estimatedCents INTEGER NOT NULL DEFAULT 0,
  actualCents INTEGER,
  complete INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX schedule_items_projectId ON schedule_items(projectId);

CREATE TABLE dependencies (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessorId TEXT NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  successorId TEXT NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  UNIQUE (predecessorId, successorId)
);
CREATE INDEX dependencies_projectId ON dependencies(projectId);

CREATE TABLE variances (
  id TEXT PRIMARY KEY,
  scheduleItemId TEXT NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('dates', 'cost', 'scope', 'party')),
  field TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT,
  reason TEXT NOT NULL DEFAULT '',
  loggedAt TEXT NOT NULL
);
CREATE INDEX variances_scheduleItemId ON variances(scheduleItemId);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  scheduleItemId TEXT NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX notes_scheduleItemId ON notes(scheduleItemId);

CREATE TABLE material_items (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scheduleItemId TEXT REFERENCES schedule_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  allowanceCents INTEGER NOT NULL DEFAULT 0,
  estimatedCents INTEGER NOT NULL DEFAULT 0,
  actualCents INTEGER,
  complete INTEGER NOT NULL DEFAULT 0,
  expectedDate TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX material_items_projectId ON material_items(projectId);
CREATE INDEX material_items_scheduleItemId ON material_items(scheduleItemId);
