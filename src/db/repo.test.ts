import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeEntries } from '../lib/scoring'
import { QUICK_UNDO_MS } from '../numbers'
import { db } from './db'
import { check, createTask, uncheck, updateTask } from './repo'

const subject = { subjectType: 'task' as const, subjectId: 't1' }

beforeEach(async () => {
  await db.open()
  await db.entries.clear()
  await db.outbox.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('undoing a check-in (spec SY-6)', () => {
  it('within N-14 erases it: no void row, nothing struck through', async () => {
    const e = await check(subject, '2026-10-29')
    vi.setSystemTime(Date.now() + QUICK_UNDO_MS - 60_000)
    await uncheck(e.id)
    const all = await db.entries.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].deletedAt).toBeTruthy()
    expect(activeEntries(all)).toHaveLength(0)
  })

  it('later keeps it as history: a void that supersedes it', async () => {
    const e = await check(subject, '2026-10-29')
    vi.setSystemTime(Date.now() + QUICK_UNDO_MS + 60_000)
    await uncheck(e.id)
    const all = await db.entries.toArray()
    expect(all).toHaveLength(2)
    expect(all.find((x) => x.outcome === 'void')?.supersedes).toBe(e.id)
    expect(activeEntries(all)).toHaveLength(0)
  })

  it('an entry that replaced another keeps the void, so the old one stays replaced', async () => {
    const old = await check(subject, '2026-10-29')
    const fix = await db.entries.put({ ...old, id: 'fix', supersedes: old.id })
    await uncheck(fix as string)
    const all = await db.entries.toArray()
    expect(all.some((x) => x.outcome === 'void' && x.supersedes === 'fix')).toBe(true)
    expect(all.every((x) => !x.deletedAt)).toBe(true)
  })

  it('the erased check-in is still queued, so the server hears of it', async () => {
    const e = await check(subject, '2026-10-29')
    await uncheck(e.id)
    const queued = await db.outbox.toArray()
    expect(queued.filter((q) => q.id === e.id)).toHaveLength(2)
  })
})

describe('putting a task off', () => {
  it('strikes the old date when it moves later on another day, not on the day it was set (owner, 2026-10-31)', async () => {
    const task = await createTask({ title: 'Call the bank', date: '2026-11-02' })
    await updateTask(task, { date: '2026-11-03' })
    expect((await db.tasks.get(task.id))?.movedFrom ?? []).toEqual([])
    vi.setSystemTime(new Date('2026-10-30T15:00:00Z'))
    await updateTask((await db.tasks.get(task.id))!, { date: '2026-11-05' })
    expect((await db.tasks.get(task.id))?.movedFrom).toEqual(['2026-11-03'])
  })
})
