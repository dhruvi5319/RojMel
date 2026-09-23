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

/** Monday of the ISO week containing a 'YYYY-MM-DD' business date. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const dow = d.getUTCDay() // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

/**
 * The shift a rotating filler is on for the week containing `date`, given
 * their role as of the week containing `setOn` — mirrors
 * rotation_effective_role() in SQL. It is what the counter's start sheet
 * suggests and what the staff page shows for "this week"; the trigger that
 * actually seeds shift_fillers runs the same rule in the database, so this
 * can be wrong for a moment on screen and never wrong in the book.
 */
export function rotationRoleOn(role: 'Day' | 'Night', setOn: string, date: string): 'Day' | 'Night' {
  const weeks = (Date.parse(`${weekStartOf(date)}T00:00:00Z`) - Date.parse(`${weekStartOf(setOn)}T00:00:00Z`))
    / (7 * 86400000)
  const same = ((Math.round(weeks) % 2) + 2) % 2 === 0
  return same ? role : role === 'Day' ? 'Night' : 'Day'
}

/**
 * Whether a filler is normally on a named shift on a date — mirrors
 * staff_is_rostered() in SQL, Sunday handover included. Used only to decide
 * which boxes the counter's start sheet pre-ticks; the shift actually seeds
 * from the database function, not from this.
 */
export function rosterIncludes(
  member: {
    default_shift: string | null
    rotates?: boolean
    rotation_role?: string | null
    rotation_set_on?: string | null
  },
  shiftName: string,
  date: string,
): boolean {
  if (!member.rotates) return member.default_shift === shiftName
  if (!member.rotation_role || !member.rotation_set_on) return false
  const effective = rotationRoleOn(member.rotation_role as 'Day' | 'Night', member.rotation_set_on, date)
  const isSunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0
  if (isSunday && shiftName === 'Night') return effective === 'Day'
  return effective === shiftName
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
