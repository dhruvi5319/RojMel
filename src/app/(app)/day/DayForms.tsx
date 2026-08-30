'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import { Alert, Field, Input, NumberInput, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { approveDay, reopenDay, submitDay } from './actions'

export function SubmitDayForm({
  date,
  expected,
  counted,
  notes,
}: {
  date: string
  expected: number
  counted: number | null
  notes: string | null
}) {
  const t = useT()
  const [value, setValue] = useState(counted != null ? String(counted) : '')
  const diff = (value.trim() === '' ? 0 : Number(value)) - expected

  return (
    <ActionForm action={submitDay} onDone={t('counter.done')}>
      <input type="hidden" name="business_date" value={date} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('day.expectedCash')}>
          <Input value={money(expected)} readOnly className="tabular text-right" />
        </Field>
        <Field label={t('day.countedCash')} required>
          <NumberInput
            name="counted_cash"
            step="0.01"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      </div>

      {value.trim() !== '' ? (
        <Alert tone={Math.abs(diff) < 0.5 ? 'ok' : diff < 0 ? 'danger' : 'accent'}>
          {t('day.difference')}: <strong>{money(diff)}</strong>
          {Math.abs(diff) < 0.5 ? ` — ${t('dash.allSquare')}` : ''}
        </Alert>
      ) : null}

      <Field label={t('common.notes')}>
        <Textarea name="notes" defaultValue={notes ?? ''} rows={2} />
      </Field>

      <div>
        <SubmitButton>{t('day.submit')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function ApproveDayForm({ date }: { date: string }) {
  const t = useT()
  return (
    <ActionForm action={approveDay} onDone={t('day.approved')}>
      <input type="hidden" name="business_date" value={date} />
      <Field label={t('day.remarks')} hint={t('common.optional')}>
        <Textarea name="remarks" rows={2} />
      </Field>
      <div>
        <SubmitButton>{t('day.approve')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function ReopenDayForm({ date }: { date: string }) {
  const t = useT()
  return (
    <ActionForm action={reopenDay} onDone={t('counter.done')}>
      <input type="hidden" name="business_date" value={date} />
      <Field label={t('day.reopenReason')} required>
        <Input name="reason" required />
      </Field>
      <div>
        <SubmitButton variant="secondary" size="md">
          {t('day.reopen')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
