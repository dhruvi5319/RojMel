'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, todayIST } from '@/lib/format'
import { useT } from '@/lib/i18n/client'

/** Prev / date / next, kept in the URL so the page stays shareable. */
export function DateNav({ date }: { date: string }) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const today = todayIST()

  function go(next: string) {
    const q = new URLSearchParams(params)
    q.set('date', next)
    router.push(`${pathname}?${q}`)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => go(addDays(date, -1))}
        aria-label="Previous day"
        className="rounded-lg border border-border bg-surface p-2.5 transition hover:bg-surface-2"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="tabular rounded-lg border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
      />

      <button
        type="button"
        onClick={() => go(addDays(date, 1))}
        disabled={date >= today}
        aria-label="Next day"
        className="rounded-lg border border-border bg-surface p-2.5 transition hover:bg-surface-2 disabled:opacity-40"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>

      {date !== today ? (
        <button
          type="button"
          onClick={() => go(today)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition hover:bg-surface-2"
        >
          {t('common.today')}
        </button>
      ) : null}
    </div>
  )
}
