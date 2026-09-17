'use client'

import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import { Field, Input } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { recordVariance } from './actions'

/** Agreeing the difference is part of closing a shift, so it gets written down. */
export function VarianceForm({
  shiftId,
  difference,
  note,
  recorded,
}: {
  shiftId: string
  difference: number
  note: string | null
  recorded: boolean
}) {
  const t = useT()
  const settled = Math.abs(difference) < 0.5

  return (
    <ActionForm
      action={recordVariance}
      className="flex flex-wrap items-end gap-3"
      onDone={t('money.recorded')}
    >
      <input type="hidden" name="shift_id" value={shiftId} />
      <div className="min-w-[14rem] flex-1">
        <Field
          label={t('money.whatHappened')}
          hint={settled ? t('money.noteOptional') : t('money.noteWanted')}
        >
          <Input name="note" defaultValue={note ?? ''} />
        </Field>
      </div>
      <SubmitButton size="md" variant={settled ? 'secondary' : 'primary'}>
        {recorded ? t('money.recordAgain') : t('money.record')} {money(difference)}
      </SubmitButton>
    </ActionForm>
  )
}
