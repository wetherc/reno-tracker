// Domain types shared by the client and the server. This file holds only
// declarations. JavaScript files reference these types through JSDoc.

export type IsoDate = string; // YYYY-MM-DD
export type IsoTimestamp = string; // full ISO 8601 with time zone
export type Cents = number; // whole cents, never fractional
export type BasisPoints = number; // whole hundredths of a percent: 1500 is 15%

// markupBasisPoints is the project manager's margin. Each new invoice
// copies it.
export interface Project {
  id: string;
  name: string;
  budgetCents: Cents;
  markupBasisPoints: BasisPoints;
  startDate: IsoDate;
  createdAt: IsoTimestamp;
}

export interface ScheduleItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  startDate: IsoDate;
  endDate: IsoDate;
  responsibleParty: string;
  estimatedCents: Cents;
  actualCents: Cents | null;
  complete: boolean;
  sortOrder: number;
}

export interface Dependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
}

export type VarianceKind = 'dates' | 'cost' | 'scope' | 'party';

export type TrackedField =
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'responsibleParty'
  | 'estimatedCents'
  | 'actualCents';

export interface Variance {
  id: string;
  scheduleItemId: string;
  kind: VarianceKind;
  field: TrackedField;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  loggedAt: IsoTimestamp;
}

export interface Note {
  id: string;
  scheduleItemId: string;
  body: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface MaterialItem {
  id: string;
  projectId: string;
  scheduleItemId: string | null;
  name: string;
  allowanceCents: Cents;
  estimatedCents: Cents;
  actualCents: Cents | null;
  complete: boolean;
  expectedDate: IsoDate | null;
  sortOrder: number;
}

// One bill from one party. Each line bills one schedule item or one
// material: exactly one of scheduleItemId and materialItemId is set.
export interface InvoiceLine {
  id: string;
  scheduleItemId: string | null;
  materialItemId: string | null;
  description: string;
  amountCents: Cents;
}

// One payment against an invoice. A deposit is a payment dated before
// the invoice's issue day.
export interface Payment {
  id: string;
  paidDate: IsoDate;
  amountCents: Cents; // more than zero
  note: string;
}

// The lines are base cost, and the total adds markupBasisPoints of
// their sum. retainageCents is the part of the total that the household
// keeps back until the work is done. It is owed but not due, and a
// payment releases it. Payments are listed by paid day.
export interface Invoice {
  id: string;
  projectId: string;
  number: string;
  party: string;
  issuedDate: IsoDate;
  dueDate: IsoDate | null;
  markupBasisPoints: BasisPoints;
  retainageCents: Cents;
  lines: InvoiceLine[];
  payments: Payment[];
}

// One project and its rows. GET /api/projects/:id returns this, and the
// client keeps one of these in memory. The change log is left out,
// because it grows with every edit. GET /api/schedule/:id/changes
// returns the rows of one item.
export interface ProjectPayload {
  project: Project;
  schedule: ScheduleItem[];
  dependencies: Dependency[];
  notes: Note[];
  materials: MaterialItem[];
  invoices: Invoice[];
}

// Inputs. Every field is optional on a patch. Create bodies fill missing
// fields from entity defaults.
export type ProjectInput = Partial<
  Pick<Project, 'name' | 'budgetCents' | 'markupBasisPoints' | 'startDate'>
>;

export type ScheduleItemInput = Partial<
  Pick<
    ScheduleItem,
    | 'title'
    | 'description'
    | 'startDate'
    | 'endDate'
    | 'responsibleParty'
    | 'estimatedCents'
    | 'actualCents'
  >
>;

// A patch may carry a reason. It is copied onto every variance row the
// patch produces.
export type ScheduleItemPatch = ScheduleItemInput & { reason?: string };

export type MaterialItemInput = Partial<
  Pick<
    MaterialItem,
    | 'scheduleItemId'
    | 'name'
    | 'allowanceCents'
    | 'estimatedCents'
    | 'actualCents'
    | 'expectedDate'
  >
>;

export type InvoiceLineInput = Pick<InvoiceLine, 'amountCents'> &
  Partial<
    Pick<InvoiceLine, 'scheduleItemId' | 'materialItemId' | 'description'>
  >;

export type PaymentInput = Pick<Payment, 'paidDate' | 'amountCents'> &
  Partial<Pick<Payment, 'note'>>;

// A patch that carries lines replaces every line of the invoice, and a
// patch that carries payments replaces every payment.
export type InvoiceInput = Partial<
  Pick<
    Invoice,
    | 'number'
    | 'party'
    | 'issuedDate'
    | 'dueDate'
    | 'markupBasisPoints'
    | 'retainageCents'
  > & {
    lines: InvoiceLineInput[];
    payments: PaymentInput[];
  }
>;

// A checked invoice with every field filled, before it gets its ids.
export type NewInvoice = Omit<
  Invoice,
  'id' | 'projectId' | 'lines' | 'payments'
> & {
  lines: Omit<InvoiceLine, 'id'>[];
  payments: Omit<Payment, 'id'>[];
};

// A checked project with every field filled, before it gets its id.
export type NewProject = Pick<
  Project,
  'name' | 'budgetCents' | 'markupBasisPoints' | 'startDate'
>;

export type NoteInput = Pick<Note, 'body'>;

export type DependencyInput = Pick<Dependency, 'predecessorId' | 'successorId'>;

export type ReorderKind = 'schedule' | 'materials';

export interface ReorderInput {
  kind: ReorderKind;
  ids: string[];
}

// Export file format. A file is one project payload plus a format tag so
// import can refuse a file from another tool.
export interface ExportFile {
  format: 'reno-tracker/1';
  exportedAt: IsoTimestamp;
  project: Project;
  schedule: ScheduleItem[];
  dependencies: Dependency[];
  variances: Variance[];
  notes: Note[];
  materials: MaterialItem[];
  // A file with no invoices list imports with no invoices.
  invoices?: Invoice[];
}

// The rows of an export file after the import check. Ids are the ones
// the file uses. Each backend swaps them for fresh ids as it inserts.
export interface ImportRows {
  project: NewProject;
  schedule: Omit<ScheduleItem, 'projectId'>[];
  dependencies: Pick<Dependency, 'predecessorId' | 'successorId'>[];
  variances: Omit<Variance, 'id'>[];
  notes: Omit<Note, 'id'>[];
  materials: (Omit<MaterialItem, 'id' | 'projectId'> & { id: string | null })[];
  invoices: NewInvoice[];
}

export interface ApiErrorBody {
  error: string;
  field?: string;
}
