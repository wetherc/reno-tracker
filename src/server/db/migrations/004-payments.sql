-- Payments against invoices, and the retainage an invoice holds back.
-- Retainage is the part of an invoice that the household keeps back
-- until the work is done. A payment belongs to one invoice, so a delete
-- of the invoice removes its payments.

ALTER TABLE invoices ADD COLUMN retainageCents INTEGER NOT NULL DEFAULT 0
  CHECK (retainageCents >= 0);

CREATE TABLE invoice_payments (
  id TEXT PRIMARY KEY,
  invoiceId TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  paidDate TEXT NOT NULL,
  amountCents INTEGER NOT NULL CHECK (amountCents > 0),
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX invoice_payments_invoiceId ON invoice_payments(invoiceId);
