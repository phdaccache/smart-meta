import Dexie, { type Table } from 'dexie'
import type {
  Base, Commitment, Displacement, Entry, Goal, GoalReview, Occurrence, Prep, Project, Revision, Task, Value,
} from '../lib/types'

/** Every synced collection. The names are also the collection keys in Postgres. */
export const COLLECTIONS = [
  'values', 'goals', 'commitments', 'preps', 'projects', 'tasks', 'entries',
  'revisions', 'occurrences', 'displacements', 'goalReviews',
] as const
export type Collection = (typeof COLLECTIONS)[number]

export interface CollectionTypes {
  values: Value
  goals: Goal
  commitments: Commitment
  preps: Prep
  projects: Project
  tasks: Task
  entries: Entry
  revisions: Revision
  occurrences: Occurrence
  displacements: Displacement
  goalReviews: GoalReview
}

export interface MetaRow {
  key: string
  value: unknown
}

export interface OutboxItem {
  seq?: number
  collection: Collection
  id: string
  queuedAt: string
}

export class AppDB extends Dexie {
  values!: Table<Value, string>
  goals!: Table<Goal, string>
  commitments!: Table<Commitment, string>
  preps!: Table<Prep, string>
  projects!: Table<Project, string>
  tasks!: Table<Task, string>
  entries!: Table<Entry, string>
  revisions!: Table<Revision, string>
  occurrences!: Table<Occurrence, string>
  displacements!: Table<Displacement, string>
  goalReviews!: Table<GoalReview, string>
  meta!: Table<MetaRow, string>
  outbox!: Table<OutboxItem, number>

  constructor(name = 'smart-meta') {
    super(name)
    // Schema migrations: never edit a published version. Add
    // this.version(n + 1).stores({...}).upgrade((tx) => ...) and bump
    // DATA_VERSION in lib/migrations.ts if record shapes change.
    this.version(1).stores({
      values: 'id, updatedAt',
      goals: 'id, state, updatedAt',
      commitments: 'id, goalId, updatedAt',
      preps: 'id, commitmentId, updatedAt',
      projects: 'id, goalId, state, updatedAt',
      tasks: 'id, projectId, goalId, updatedAt',
      entries: 'id, [subjectType+subjectId], date, updatedAt',
      revisions: 'id, goalId, updatedAt',
      occurrences: 'id, commitmentId, date, updatedAt',
      displacements: 'id, updatedAt',
      goalReviews: 'id, goalId, updatedAt',
      meta: 'key',
      outbox: '++seq, [collection+id]',
    })
  }

  coll<C extends Collection>(c: C): Table<CollectionTypes[C], string> {
    return this.table(c) as Table<CollectionTypes[C], string>
  }
}

export const db = new AppDB()

export type AnyRecord = Base & Record<string, unknown>
