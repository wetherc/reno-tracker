-- Change orders and their lines. Each line adds its amount to the
-- estimate of one schedule item or one material, once the change order
-- is approved. The two item links have no ON DELETE action, so a delete
-- of one item or material that a line names fails, the same as for
-- invoice lines. A project delete still removes every row, because
-- SQLite checks those links at the end of the statement.

CREATE TABLE change_orders (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number TEXT NOT NULL DEFAULT '',
  party TEXT NOT NULL,
  issuedDate TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
  description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX change_orders_projectId ON change_orders(projectId);

CREATE TABLE change_order_lines (
  id TEXT PRIMARY KEY,
  changeOrderId TEXT NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  scheduleItemId TEXT REFERENCES schedule_items(id),
  materialItemId TEXT REFERENCES material_items(id),
  description TEXT NOT NULL DEFAULT '',
  amountCents INTEGER NOT NULL CHECK (amountCents >= 0),
  CHECK ((scheduleItemId IS NULL) <> (materialItemId IS NULL))
);
CREATE INDEX change_order_lines_changeOrderId ON change_order_lines(changeOrderId);
CREATE INDEX change_order_lines_scheduleItemId ON change_order_lines(scheduleItemId);
CREATE INDEX change_order_lines_materialItemId ON change_order_lines(materialItemId);
