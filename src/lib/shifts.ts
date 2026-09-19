import type { DictKey } from '@/lib/i18n/dict'

/**
 * The pump runs two shifts, and they have hours: the day is 7am to 7pm and
 * the night is 7pm to 7am. Named here once, because the shift opener, the
 * counter device and every slip form must offer the same two — a third name
 * typed on one screen would be a shift the money log could never reconcile.
 */
export const SHIFTS: { name: string; key: DictKey; order: number }[] = [
  { name: 'Day', key: 'shift.day', order: 1 },
  { name: 'Night', key: 'shift.night', order: 2 },
]

/**
 * When the shifts change over. The pump's own, kept on the station and
 * editable under Settings — 7am and 7pm are only what a new pump starts with.
 * `pump_day()` and `pump_shift()` read the same two columns, so a screen
 * cannot disagree with a policy about which shift somebody is standing in.
 */
export interface ShiftHours {
  day_starts_at: string
  night_starts_at: string
}

export const DEFAULT_HOURS: ShiftHours = {
  day_starts_at: '07:00',
  night_starts_at: '19:00',
}

/** '07:00:00' or '07:00' -> minutes since midnight. */
function minutes(clock: string): number {
  const [h, m] = clock.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

/** Minutes since midnight in India, whatever the device's own clock says. */
function istMinutes(at: Date): number {
  const [h, m] = at
    .toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    })
    .split(':')
  return Number(h) * 60 + Number(m)
}

/** The shift being worked right now — the clock knows, so nobody is asked. */
export function shiftAt(at: Date = new Date(), hours: ShiftHours = DEFAULT_HOURS) {
  const now = istMinutes(at)
  return now >= minutes(hours.day_starts_at) && now < minutes(hours.night_starts_at)
    ? SHIFTS[0]
    : SHIFTS[1]
}

/**
 * The business date the pump is working. It rolls when the day shift takes
 * over rather than at midnight: before then the night shift is still running,
 * and what it sells belongs to the day it started. `pump_day()` is the same
 * rule in SQL and the two must agree.
 */
export function businessDateAt(
  at: Date = new Date(),
  hours: ShiftHours = DEFAULT_HOURS,
): string {
  const ist = at.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  if (istMinutes(at) >= minutes(hours.day_starts_at)) return ist

  const d = new Date(`${ist}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** '7am – 7pm', for a screen that should say when the shift runs. */
export function shiftHours(name: string, hours: ShiftHours = DEFAULT_HOURS): string {
  const clock = (c: string) => {
    const [h, m] = c.split(':').map(Number)
    const suffix = h < 12 ? 'am' : 'pm'
    const hour = h % 12 === 0 ? 12 : h % 12
    return m ? `${hour}.${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
  }
  return name === SHIFTS[0].name
    ? `${clock(hours.day_starts_at)} – ${clock(hours.night_starts_at)}`
    : `${clock(hours.night_starts_at)} – ${clock(hours.day_starts_at)}`
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
