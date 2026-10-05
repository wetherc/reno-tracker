-- The margin on one invoice or change order line, in basis points. Null
-- means the line takes the rate of its document, so a change to the
-- document rate moves every line that has no rate of its own.

ALTER TABLE invoice_lines ADD COLUMN markupBasisPoints INTEGER
  CHECK (markupBasisPoints BETWEEN 0 AND 10000);

ALTER TABLE change_order_lines ADD COLUMN markupBasisPoints INTEGER
  CHECK (markupBasisPoints BETWEEN 0 AND 10000);
