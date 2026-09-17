'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { moneyCompact, todayIST } from '@/lib/format'
import type { DayBookEntry } from '@/lib/database.types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * A month at a glance. Every day the pump traded is a cell carrying what it
 * sold and how far it got, so the shape of the month is visible before any
 * date is opened — which days were approved, which are still waiting, and
 * which did not balance.
 */
export function Calendar({
  month,
  entries,
}: {
  month: string
  entries: DayBookEntry[]
}) {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const today = todayIST()

  const byDate = new Map(entries.map((e) => [e.business_date, e]))
  const [year, mon] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, mon - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  // Monday-first, as a week is read here.
  const lead = (first.getUTCDay() + 6) % 7

  function goMonth(delta: number) {
    const d = new Date(Date.UTC(year, mon - 1 + delta, 1))
    const next = d.toISOString().slice(0, 7)
    const q = new URLSearchParams(params)
    q.set('month', next)
    router.push(`/daybook?${q}`)
  }

  const label = first.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Previous month"
          className="cursor-pointer rounded-full border border-divider bg-surface p-2.5 transition hover:bg-accent-100"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="min-w-[10rem] text-center font-[family-name:var(--font-heading)] text-[19px]">
          {label}
        </span>
        <button
          type="button"
          onClick={() => goMonth(1)}
          disabled={month >= today.slice(0, 7)}
          aria-label="Next month"
          className="cursor-pointer rounded-full border border-divider bg-surface p-2.5 transition hover:bg-accent-100 disabled:opacity-35"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-[11px] font-semibold tracking-[0.06em] text-neutral-600 uppercase"
          >
            {d}
          </div>
        ))}

        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const date = `${month}-${String(day).padStart(2, '0')}`
          const entry = byDate.get(date)
          const future = date > today
          const isToday = date === today
          const off = entry && Math.abs(Number(entry.difference)) >= 0.5

          // Approved reads olive, waiting reads terracotta, out-of-balance reads red.
          const tone = !entry
            ? 'bg-surface/60 text-neutral-500'
            : off
              ? 'bg-danger-100 text-danger'
              : entry.approved
                ? 'bg-accent-2-200 text-accent-2-900'
                : 'bg-accent-200 text-accent-900'

          const cell = (
            <>
              <span className="tabular text-[13px] font-semibold">{day}</span>
              {entry ? (
                <span className="tabular mt-0.5 block text-[11px] leading-tight">
                  {moneyCompact(entry.total_sale)}
                </span>
              ) : null}
            </>
          )

          const shell =
            `flex min-h-[3.6rem] flex-col justify-start rounded-[14px] px-2 py-1.5 text-left ` +
            `${tone} ${isToday ? 'ring-2 ring-accent' : ''}`

          return entry ? (
            <Link
              key={date}
              href={`/moneylog?date=${date}`}
              title={`${t('book.openDay')} — ${date}`}
              className={`${shell} transition hover:brightness-95`}
            >
              {cell}
            </Link>
          ) : (
            <div key={date} className={`${shell} ${future ? 'opacity-40' : ''}`}>
              {cell}
            </div>
          )
        })}
      </div>
    </div>
  )
}
