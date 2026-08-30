'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Month selector kept in the URL, so a month's page can be linked or printed. */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <input
      type="month"
      value={month}
      onChange={(e) => {
        if (!e.target.value) return
        const q = new URLSearchParams(params)
        q.set('month', e.target.value)
        router.push(`${pathname}?${q}`)
      }}
      className="tabular rounded-lg border border-divider bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
    />
  )
}
