-- Bootstrap schema. This runs on every open, before migrations, so the
-- migration runner always has a place to read the schema version from.
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schemaVersion', '0');
