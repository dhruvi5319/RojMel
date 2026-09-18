'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import { Field, NumberInput } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { saveShiftMoney } from './actions'

const n = (v: string) => (v.trim() === '' ? 0 : Number(v))

/**
 * What the manager writes in here: the money that settled into the pump's one
 * account — UPI, the ATM machine, the BPCL card — plus any cash not already
 * handed over by a named filler.
 *
 * Cash the fillers handed over is entered on the shift screen, where the notes
 * actually change hands, and is shown here only to be counted. Udhaar is not
 * typed at all: it comes from the slips, and typing it again would be a second
 * chance to get it wrong.
 */
export function MoneyForm({
  shiftId,
  cash,
  card,
  upi,
  bpcl,
  udhaar,
  sold,
  byFiller,
}: {
  shiftId: string
  cash: number
  card: number
  upi: number
  bpcl: number
  udhaar: number
  sold: number
  /** already handed over by named fillers on the shift screen */
  byFiller: number
}) {
  const t = useT()
  const [v, setV] = useState({
    cash: String(cash || ''),
    card: String(card || ''),
    upi: String(upi || ''),
    bpcl: String(bpcl || ''),
  })

  const typed = n(v.cash) + n(v.card) + n(v.upi) + n(v.bpcl)
  const willBe = typed + byFiller + udhaar
  const diff = sold - willBe

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }))

  return (
    <ActionForm action={saveShiftMoney} onDone={t('money.moneySaved')}>
      <input type="hidden" name="shift_id" value={shiftId} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('mode.card')}>
          <NumberInput name="card" step="0.01" value={v.card} onChange={set('card')} />
        </Field>
        <Field label={t('mode.upi')}>
          <NumberInput name="upi" step="0.01" value={v.upi} onChange={set('upi')} />
        </Field>
        <Field label={t('mode.bpcl_card')}>
          <NumberInput name="bpcl" step="0.01" value={v.bpcl} onChange={set('bpcl')} />
        </Field>
      </div>

      {/* Cash the fillers handed over, plus anything not attributed to one. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('money.cashFromFillers')}
          hint={t('money.cashEnteredOnShift')}
        >
          <NumberInput value={byFiller.toFixed(2)} readOnly disabled />
        </Field>
        <Field label={t('money.otherCash')} hint={t('money.otherCashHint')}>
          <NumberInput name="cash" step="0.01" value={v.cash} onChange={set('cash')} />
        </Field>
      </div>

      {/* What the entry adds up to before it is saved, so a wrong figure is
          caught while it is still in the hand. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-neutral-200 px-5 py-3 text-[13.5px]">
        <span>
          {t('tab.udhaar')} <strong className="tabular">{money(udhaar)}</strong>
        </span>
        <span
          className={`tabular font-semibold ${
            Math.abs(diff) < 0.5 ? 'text-accent-2-800' : 'text-danger'
          }`}
        >
          {Math.abs(diff) < 0.5
            ? t('money.balances')
            : `${diff > 0 ? t('money.short') : t('money.over')} ${money(Math.abs(diff))}`}
        </span>
      </div>

      <div>
        <SubmitButton size="md">{t('money.saveMoney')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
