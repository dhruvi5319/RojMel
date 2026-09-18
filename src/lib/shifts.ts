import type { DictKey } from '@/lib/i18n/dict'

/**
 * The pump runs two shifts: whoever had the day, and whoever had the night.
 *
 * They are named here once, because the shift opener, the counter device and
 * every slip form must offer the same two — a third name typed on one screen
 * would be a shift the money log could never reconcile.
 */
export const SHIFTS: { name: string; key: DictKey; order: number }[] = [
  { name: 'Day', key: 'shift.day', order: 1 },
  { name: 'Night', key: 'shift.night', order: 2 },
]

/**
 * A stored shift name in the reader's language. The name in the database is
 * the pump's word ('Day'); the screen shows 'Day shift' or 'દિવસ શિફ્ટ'. An
 * older name that predates the two-shift pump is shown as it was stored.
 */
export function shiftLabel(t: (k: DictKey) => string, name: string): string {
  const known = SHIFTS.find((s) => s.name === name)
  return known ? t(known.key) : name
}
