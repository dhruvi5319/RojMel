'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/client'
import { formatTime } from '@/lib/format'
import type { Shift } from '@/lib/database.types'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { approveShift, reopenShift, setShiftStatus } from '../actions'

const tone = { open: 'accent', submitted: 'neutral', approved: 'ok' } as const

/**
 * Where the shift is, and the one thing to do about it next.
 *
 * A filler starts and finishes their own shift on the counter; this is the
 * office's half — see it, correct it, and agree it. Agreeing is what stops the
 * filler editing, so it is deliberately the last button, not the first.
 */
export function ShiftStatusBar({
  shift,
  approvedByName,
  openedByName,
  closedByName,
}: {
  shift: Shift
  approvedByName?: string | null
  /** the filler who pressed start on the forecourt, if one did */
  openedByName?: string | null
  /** and the one who handed it in */
  closedByName?: string | null
}) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<{ error?: string }>) => () => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <Badge tone={tone[shift.status]}>{t(`shift.${shift.status}`)}</Badge>
        <span className="ml-3 text-[12.5px] text-neutral-700">
          {shift.status === 'approved' && shift.approved_at
            ? `${t('shift.agreedAt')} ${formatTime(shift.approved_at)}${
                approvedByName ? ` · ${approvedByName}` : ''
              }`
            : shift.status === 'submitted'
              ? t('shift.handedIn')
              : t('shift.stillRunning')}
        </span>
        {/* The hour the shift really began and who began it — written by the
            counter, and until now shown on no office screen. */}
        <div className="tabular mt-1.5 text-[12.5px] text-neutral-700">
          {openedByName
            ? `${openedByName} ${t('shift.startedIt')} ${formatTime(shift.opened_at)}`
            : `${t('shift.openedByOffice')} ${formatTime(shift.opened_at)}`}
          {shift.closed_at
            ? ` · ${closedByName ? `${closedByName} ` : ''}${t('shift.handedItIn')} ${formatTime(shift.closed_at)}`
            : ''}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {shift.status === 'open' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={run(() => setShiftStatus(shift.id, 'submitted'))}
          >
            {t('shift.markHandedIn')}
          </Button>
        ) : null}

        {shift.status === 'approved' ? (
          <Button size="sm" variant="secondary" disabled={pending}
            onClick={run(() => reopenShift(shift.id))}>
            {t('shift.reopen')}
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={run(() => approveShift(shift.id))}>
            {t('shift.agree')}
          </Button>
        )}
      </div>

      {error ? (
        <div className="w-full">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
    </Card>
  )
}
