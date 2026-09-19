/**
 * Indian conventions throughout: rupees with lakh/crore grouping, litres to
 * two decimals, dates as "29 Aug 2026". These are display helpers only —
 * every figure that decides money is computed in Postgres.
 */

import { businessDateAt } from '@/lib/shifts'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const plain = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const litreFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function money(value: number | null | undefined): string {
  return inr.format(Number(value ?? 0))
}

export function moneyWhole(value: number | null | undefined): string {
  return inrWhole.format(Number(value ?? 0))
}

export function num(value: number | null | undefined): string {
  return plain.format(Number(value ?? 0))
}

export function litres(value: number | null | undefined): string {
  return `${litreFmt.format(Number(value ?? 0))} L`
}

/** Litres for petrol and diesel, kilograms for CNG. */
export function quantity(
  value: number | null | undefined,
  unit: 'L' | 'kg' = 'L',
): string {
  return `${litreFmt.format(Number(value ?? 0))} ${unit}`
}

export function rate(value: number | null | undefined): string {
  return `₹${plain.format(Number(value ?? 0))}`
}

/** "1.2 L" / "12.5 K" / "3.4 L" — Indian short scale for dashboard tiles. */
export function moneyCompact(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)} K`
  return `${sign}₹${abs.toFixed(0)}`
}

/** The business date the pump is trading in, regardless of device timezone. */
/**
 * The day the pump is working — the one idea of "today" in this app.
 *
 * It rolls at 7am with the day shift, not at midnight, because the night shift
 * runs 7pm to 7am: at 2am the forecourt is still working the shift that
 * started last evening. If the office called that "tomorrow" while the counter
 * called it "today", a manager opening the app at 2am would be shown an empty
 * day while the pump was still trading. `pump_day()` is the same rule in SQL.
 */
export function todayIST(): string {
  return businessDateAt()
}

/** The calendar date in India, for anything that means the date and not the
 *  pump's working day. */
export function calendarDateIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

/** First day of the month, used to default invoice periods. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
