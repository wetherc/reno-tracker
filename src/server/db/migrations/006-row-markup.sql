-- The margin on the estimate of one schedule item or material, in basis
-- points. Null means the row takes the project rate, so a change to the
-- project rate moves every row that has no rate of its own.

ALTER TABLE schedule_items ADD COLUMN markupBasisPoints INTEGER
  CHECK (markupBasisPoints BETWEEN 0 AND 10000);

ALTER TABLE material_items ADD COLUMN markupBasisPoints INTEGER
  CHECK (markupBasisPoints BETWEEN 0 AND 10000);
