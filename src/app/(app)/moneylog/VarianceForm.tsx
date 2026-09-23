'use client'

import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import { Field, Input } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { recordVariance } from './actions'

/**
 * Whether the shift is short, and what was agreed about it — in words.
 *
 * It lives out here because it must be readable with the form shut: the money
 * log shows what is recorded and opens the form only when somebody means to
 * change it, and a page that stops saying "this shift is short by" the moment
 * the pencil closes has hidden the one thing it exists to say.
 */
export function VarianceSaid({
  difference,
  note,
  recorded,
  recordedAmount,
  className,
}: {
  difference: number
  note: string | null
  recorded: boolean
  recordedAmount?: number | null
  className?: string
}) {
  const t = useT()
  const settled = Math.abs(difference) < 0.5

  return (
    <p className={`text-[13.5px] ${className ?? ''}`}>
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
          {t('money.signedOff')} <strong className="tabular">{money(recordedAmount ?? 0)}</strong>
          {note ? ` — ${note}` : ''}
        </span>
      ) : null}
    </p>
  )
}

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
      alwaysReady
    >
      <input type="hidden" name="shift_id" value={shiftId} />

      <VarianceSaid
        difference={difference}
        note={note}
        recorded={recorded}
        recordedAmount={recordedAmount}
      />

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
