// Domain types shared by the client and the server. This file holds only
// declarations. JavaScript files reference these types through JSDoc.

export type IsoDate = string; // YYYY-MM-DD
export type IsoTimestamp = string; // full ISO 8601 with time zone
export type Cents = number; // whole cents, never fractional

export interface Project {
  id: string;
  name: string;
  budgetCents: Cents;
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

// One project and every row that belongs to it. GET /api/projects/:id
// returns this, and the client keeps one of these in memory.
export interface ProjectPayload {
  project: Project;
  schedule: ScheduleItem[];
  dependencies: Dependency[];
  variances: Variance[];
  notes: Note[];
  materials: MaterialItem[];
}

// Inputs. Every field is optional on a patch. Create bodies fill missing
// fields from entity defaults.
export type ProjectInput = Partial<
  Pick<Project, 'name' | 'budgetCents' | 'startDate'>
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
}

export interface ApiErrorBody {
  error: string;
  field?: string;
}
