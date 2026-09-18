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
  recordedAmount,
}: {
  shiftId: string
  difference: number
  note: string | null
  recorded: boolean
  /** the figure already agreed, when there is one */
  recordedAmount?: number | null
}) {
  const t = useT()
  const settled = Math.abs(difference) < 0.5

  return (
    <ActionForm
      action={recordVariance}
      className="flex flex-col gap-3"
      onDone={t('money.recorded')}
      stayOpen
    >
      <input type="hidden" name="shift_id" value={shiftId} />

      {/* The figure being settled, said in words — the button used to be the
          only place the amount appeared, which made it look like a second way
          of saving the money rather than the thing it is. */}
      <p className="text-[13.5px]">
        {settled ? (
          <span className="text-accent-2-800">{t('money.nothingToSettle')}</span>
        ) : (
          <>
            {difference > 0 ? t('money.shiftShortBy') : t('money.shiftOverBy')}{' '}
            <strong className="tabular text-danger">{money(Math.abs(difference))}</strong>
          </>
        )}
        {recorded ? (
          <span className="text-neutral-600">
            {' · '}
            {t('money.signedOff')}{' '}
            <strong className="tabular">{money(recordedAmount ?? 0)}</strong>
            {note ? ` — ${note}` : ''}
          </span>
        ) : null}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Field
            label={t('money.whatHappened')}
            hint={settled ? t('money.noteOptional') : t('money.noteWanted')}
          >
            <Input name="note" defaultValue={note ?? ''} />
          </Field>
        </div>
        <SubmitButton size="md" variant={settled || recorded ? 'secondary' : 'primary'}>
          {recorded ? t('money.signOffAgain') : t('money.signOff')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
