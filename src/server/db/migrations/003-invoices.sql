-- Invoices and their lines. Each line bills exactly one schedule item or
-- one material. The two item links have no ON DELETE action, so a delete
-- of one billed item or material fails and the invoice total stays as
-- it is. A project delete still removes every row, because SQLite checks
-- those links at the end of the statement, after the cascade from
-- projects has removed the invoices.

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number TEXT NOT NULL DEFAULT '',
  party TEXT NOT NULL,
  issuedDate TEXT NOT NULL,
  dueDate TEXT
);
CREATE INDEX invoices_projectId ON invoices(projectId);

CREATE TABLE invoice_lines (
  id TEXT PRIMARY KEY,
  invoiceId TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  scheduleItemId TEXT REFERENCES schedule_items(id),
  materialItemId TEXT REFERENCES material_items(id),
  description TEXT NOT NULL DEFAULT '',
  amountCents INTEGER NOT NULL,
  CHECK ((scheduleItemId IS NULL) <> (materialItemId IS NULL))
);
CREATE INDEX invoice_lines_invoiceId ON invoice_lines(invoiceId);
CREATE INDEX invoice_lines_scheduleItemId ON invoice_lines(scheduleItemId);
CREATE INDEX invoice_lines_materialItemId ON invoice_lines(materialItemId);
