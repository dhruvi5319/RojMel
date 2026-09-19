import type { DictKey } from '@/lib/i18n/dict'

/**
 * The pump runs two shifts, and they have hours: the day is 7am to 7pm and
 * the night is 7pm to 7am. Named here once, because the shift opener, the
 * counter device and every slip form must offer the same two — a third name
 * typed on one screen would be a shift the money log could never reconcile.
 */
export const SHIFTS: {
  name: string
  key: DictKey
  order: number
  /** IST hour it starts, inclusive */
  from: number
  /** IST hour it ends, exclusive */
  to: number
}[] = [
  { name: 'Day', key: 'shift.day', order: 1, from: 7, to: 19 },
  { name: 'Night', key: 'shift.night', order: 2, from: 19, to: 7 },
]

/**
 * The pump's working day starts when the day shift does.
 *
 * This matters more than it looks. The night shift runs past midnight, so at
 * 2am the people on the forecourt are still working the shift that started
 * last evening — and what they sell belongs to that day's book, not to the
 * calendar date the clock has just rolled over to. Without this, a slip
 * written at 2am would land on tomorrow and split one night's takings across
 * two days, so neither would tally.
 */
export const DAY_STARTS_AT = SHIFTS[0].from

/** The hour of the day in India, whatever the device's own clock is set to. */
function istHour(at: Date): number {
  return Number(
    at.toLocaleString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false,
    }),
  )
}

/** The shift being worked right now — the clock knows, so nobody is asked. */
export function shiftAt(at: Date = new Date()) {
  const hour = istHour(at)
  return hour >= DAY_STARTS_AT && hour < SHIFTS[1].from ? SHIFTS[0] : SHIFTS[1]
}

/**
 * The business date the pump is working, which rolls at 7am rather than at
 * midnight. Before 7am the night shift is still running, and it belongs to
 * the day it started.
 */
export function businessDateAt(at: Date = new Date()): string {
  const ist = at.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  if (istHour(at) >= DAY_STARTS_AT) return ist

  const d = new Date(`${ist}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** '7am to 7pm', for a screen that should say when the shift runs. */
export function shiftHours(name: string): string | null {
  const s = SHIFTS.find((x) => x.name === name)
  if (!s) return null
  const clock = (h: number) =>
    h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  return `${clock(s.from)} – ${clock(s.to)}`
}

/**
 * A stored shift name in the reader's language. The name in the database is
 * the pump's word ('Day'); the screen shows 'Day shift' or 'દિવસ શિફ્ટ'. An
 * older name that predates the two-shift pump is shown as it was stored.
 */
export function shiftLabel(t: (k: DictKey) => string, name: string): string {
  const known = SHIFTS.find((s) => s.name === name)
  return known ? t(known.key) : name
}
