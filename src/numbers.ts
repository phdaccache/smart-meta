/**
 * The phone's adjustable numbers (spec RE-5), each named by its id in the spec's "Adjustable numbers"
 * table. Change one here and in that table; the server's live in its migrations (`private.*_max()`).
 */

/** N-1: members at most. The server holds the real cap (private.members_max). */
export const MEMBERS_MAX = 100

/** N-14: a check-in undone this soon is erased instead of kept as "undone" history. */
export const QUICK_UNDO_MS = 30 * 60_000

/** N-15: sync waits this long after the last change, so a burst of taps is one sync. */
export const SYNC_AFTER_CHANGE_MS = 2_000

/** Pushes are planned this soon after a change, before the sync (S5). */
export const PLAN_AFTER_CHANGE_MS = 800

/** N-16: the longest sync waits during continuous editing. */
export const SYNC_MAX_WAIT_MS = 10_000

/** N-17: periodic sync, only while the app is on screen. */
export const SYNC_EVERY_MS = 5 * 60_000

/** N-6: how far ahead the phone plans pushes. The server takes up to 15 days (private.plan_ahead_max). */
export const PLAN_DAYS = 14

/** N-5: pushes waiting on the server at most (private.pending_max is 300); the rest leaves room for a test push. */
export const PLAN_ROWS_MAX = 290

/** A task's date changed within this long of being set (or the same day) isn't put off: a change of mind. */
export const CHANGE_OF_MIND_MS = 30 * 60_000

/** N-7: pushes a day the app starts by itself (morning summary, weekly review). */
export const APP_PUSHES_MAX = 3

/** N-10: reminders this close in time to the one tapped show with it in Today's "Now". */
export const NOW_MS = 15 * 60_000

/** N-11: the morning summary's time to start with. */
export const SUMMARY_TIME = '08:00'

/** N-12: the weekly review's push, Mondays at this time to start with. */
export const REVIEW_TIME = '08:00'

/** N-26: quiet hours to start with, once turned on. */
export const QUIET_FROM = '22:00'
export const QUIET_TO = '07:00'
