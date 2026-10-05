-- The project manager's markup on the lines of a change order, in basis
-- points. A contractor can price one change with a margin other than the
-- project rate, so each change order keeps a rate of its own. A change
-- order stored before this file takes the rate of its project.

ALTER TABLE change_orders ADD COLUMN markupBasisPoints INTEGER NOT NULL DEFAULT 0
  CHECK (markupBasisPoints BETWEEN 0 AND 10000);

UPDATE change_orders SET markupBasisPoints = (
  SELECT markupBasisPoints FROM projects WHERE projects.id = change_orders.projectId
);
