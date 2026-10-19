export type ID = string
/** A logical day, 'YYYY-MM-DD', already adjusted for the day-rollover offset. */
export type DateStr = string

export interface Base {
  id: ID
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface Value extends Base {
  name: string
  description: string
  /** A key of VALUE_ICONS; missing: the default icon. */
  icon?: string | null
  /** A key of VALUE_COLORS; missing: a color from the value's place in the list. */
  color?: string | null
}

export type GoalState = 'backlog' | 'active' | 'maintenance' | 'abandoned' | 'completed'

/**
 * habit: a behavior kept up, measured by its commitments' check-ins.
 * outcome: a finish line reached once ("did I get the job?"), by a deadline
 * plus some grace; commitments are optional supporting habits.
 */
export type GoalKind = 'habit' | 'outcome'

export interface Goal extends Base {
  /** Missing on goals made before outcomes existed: treat as 'habit'. */
  kind?: GoalKind
  title: string
  /** Outcome only: the yes/no sentence that says it's done. */
  doneWhen?: string | null
  /** Outcome only: extra days after the deadline that still count. */
  graceDays?: number | null
  whyValueId: ID
  whyText: string
  state: GoalState
  tolerancePct: number
  startDate: DateStr
  targetDate?: DateStr | null
  priority: number
  abandonReason?: string | null
}

export type Shape = 'rhythm' | 'standard' | 'threshold'
export type Period = 'day' | 'week' | 'month'
export type CheckinType = 'binary' | 'quantity' | 'timestamp'
export type Comparator = 'gte' | 'lte'

export interface Cadence {
  period: Period
  /** Rhythm: hits wanted per period. Threshold and standard: always 1. */
  times: number
}

export interface Commitment extends Base {
  goalId: ID
  /** Scoring starts here: the goal's start date, or the day it was added. */
  startDate: DateStr
  shape: Shape
  /** Short noun used in prompts: "gym", "sleep". */
  label: string
  /** The sentence that makes a check-in answerable without judgment. */
  measurementDefinition: string
  checkinType: CheckinType
  cadence: Cadence
  /** Threshold only. Quantity: a number. Timestamp: minutes after midnight. */
  targetValue?: number | null
  comparator?: Comparator | null
  unit?: string | null
}

export interface Prep extends Base {
  commitmentId: ID
  title: string
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  fireWeekdays: number[]
  /** 'HH:MM' */
  fireTime: string
}

/** New projects wait in the backlog until started. */
export type ProjectState = 'backlog' | 'active' | 'done' | 'archived'

export interface Project extends Base {
  title: string
  /** Free text kept with it. */
  note?: string | null
  targetDate: DateStr
  goalId?: ID | null
  state: ProjectState
  /** The day its clock started (moved on by any time spent back in the backlog); missing: createdAt. */
  startDate?: DateStr | null
  /** The day it went back to the backlog; missing on one waiting since it was made (use createdAt). */
  backlogSince?: DateStr | null
}

export interface Task extends Base {
  title: string
  /** Free text kept with it. */
  note?: string | null
  /** A task's due date. On a project step: the end date the person set (otherwise spread, see stepDeadlines). */
  date?: DateStr | null
  /** Tasks only, optional: 'HH:MM'. */
  time?: string | null
  /** Tasks only: the dates it was due before, oldest first. Kept each time its date moves later or is taken off. */
  movedFrom?: DateStr[] | null
  goalId?: ID | null
  /** Set: one of that project's steps, in `order`. */
  projectId?: ID | null
  order?: number | null
  /**
   * A task for a project that isn't one of its steps: due when it's due, on
   * Today with the project. Its own field (not projectId) so older versions
   * of the app show it as a plain task rather than a step.
   */
  forProjectId?: ID | null
}

export type SubjectType = 'commitment' | 'prep' | 'task'
export type Outcome = 'hit' | 'miss' | 'void'
export type MissReason = 'no_time' | 'chose_other' | 'too_tired' | 'forgot'

/**
 * Append-only. A correction is a new entry that supersedes an older one;
 * an undo is a 'void' entry that supersedes it.
 */
export interface Entry extends Base {
  subjectType: SubjectType
  subjectId: ID
  /** The logical day the entry applies to (may be in the past: backfill). */
  date: DateStr
  /** Wall-clock time the entry was written. */
  recordedAt: string
  outcome: Outcome
  /** Quantity: a number. Timestamp: minutes after midnight. */
  value?: number | null
  missReason?: MissReason | null
  displacementId?: ID | null
  note?: string | null
  supersedes?: ID | null
  occurrenceId?: ID | null
}

export interface Revision extends Base {
  goalId: ID
  /**
   * Goal edits: the goal's field name ("tolerancePct", "state"). Commitment
   * edits: "<label> <part>" in English ("gym how often"), still written so
   * older versions of the app can read it.
   */
  field: string
  /** Readable values; commitment edits store them in English. */
  oldValue: string
  newValue: string
  timestamp: string
  /** Commitment edits: which commitment and which part, so nothing depends on wording. */
  commitmentId?: ID | null
  part?: CommitmentPart | null
  /** Commitment edits: the stored values (a cadence, a number, a code), shown in the current language. */
  oldRaw?: unknown
  newRaw?: unknown
}

export type CommitmentPart = 'label' | 'measurementDefinition' | 'checkinType' | 'cadence' | 'targetValue' | 'comparator' | 'unit'

export interface Occurrence extends Base {
  commitmentId: ID
  /** Local 'YYYY-MM-DDTHH:MM' */
  scheduledAt: string
  date: DateStr
  source: 'manual' | 'calendar'
  externalRef?: string | null
  entryId?: ID | null
}

export interface Displacement extends Base {
  label: string
}

export interface GoalReview extends Base {
  goalId: ID
  timestamp: string
  hit: boolean
  whatHappened: string
  journalNote: string
  outcome: 'renewed' | 'maintenance' | 'completed'
}

/** One weekly review: the Monday of the week reviewed, and what was decided. */
export interface WeekReview extends Base {
  week: DateStr
  /** Set by "Done for this week". */
  doneAt: string | null
  /** Suggestion keys dismissed during this review; hidden for a few weeks. */
  dismissed: string[]
}

export type Status = 'on track' | 'behind' | 'at risk'
