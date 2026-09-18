'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { Alert, Button, Card, CardHeader } from '@/components/ui'
import { SHIFTS } from '@/lib/shifts'
import { openShift } from './actions'



export function OpenShiftForm({ date, taken }: { date: string; taken: string[] }) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const available = SHIFTS.filter((s) => !taken.includes(s.name))
  if (available.length === 0) return null

  function open(name: string, order: number) {
    setError(null)
    startTransition(async () => {
      const data = new FormData()
      data.set('business_date', date)
      data.set('name', name)
      data.set('sort_order', String(order))
      const result = await openShift(data)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <Card>
      <CardHeader title={t('shift.new')} subtitle={t('shift.fillerStarts')} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {available.map((s) => (
            <Button
              key={s.name}
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => open(s.name, s.order)}
            >
              <Plus className="size-4" aria-hidden />
              {t(s.key)}
            </Button>
          ))}
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Card>
  )
}
