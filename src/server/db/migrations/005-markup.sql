-- The project manager's markup, in basis points: 1500 is 15%. Each new
-- invoice copies the project rate. An invoice keeps its own rate, so a
-- later change to the project rate does not change the total of an
-- invoice already entered. Rows stored before this file take no markup.

ALTER TABLE projects ADD COLUMN markupBasisPoints INTEGER NOT NULL DEFAULT 0
  CHECK (markupBasisPoints BETWEEN 0 AND 10000);

ALTER TABLE invoices ADD COLUMN markupBasisPoints INTEGER NOT NULL DEFAULT 0
  CHECK (markupBasisPoints BETWEEN 0 AND 10000);
