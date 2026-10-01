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

export type ProjectState = 'active' | 'done' | 'archived'

export interface Project extends Base {
  title: string
  targetDate: DateStr
  goalId?: ID | null
  state: ProjectState
}

export interface Task extends Base {
  title: string
  date?: DateStr | null
  goalId?: ID | null
  projectId?: ID | null
  order?: number | null
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
