'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { Button } from '@/components/ui'

export function RangePicker({ from, to }: { from: string; to: string }) {
  const t = useT()
  const router = useRouter()
  const [a, setA] = useState(from)
  const [b, setB] = useState(to)

  const field =
    'tabular rounded-lg border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/25'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={a}
        max={b}
        aria-label={t('common.from')}
        onChange={(e) => setA(e.target.value)}
        className={field}
      />
      <input
        type="date"
        value={b}
        min={a}
        aria-label={t('common.to')}
        onChange={(e) => setB(e.target.value)}
        className={field}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => router.push(`/reports?from=${a}&to=${b}`)}
      >
        {t('common.filter')}
      </Button>
    </div>
  )
}
