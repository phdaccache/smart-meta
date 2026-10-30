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

/** N-16: the longest sync waits during continuous editing. */
export const SYNC_MAX_WAIT_MS = 10_000

/** N-17: periodic sync, only while the app is on screen. */
export const SYNC_EVERY_MS = 5 * 60_000
