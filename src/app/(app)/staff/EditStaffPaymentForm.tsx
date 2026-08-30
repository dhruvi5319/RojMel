'use client'

import { useT } from '@/lib/i18n/client'
import type { PaymentMode, StaffPayment, StaffPaymentType } from '@/lib/database.types'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { updateStaffPayment } from './actions'

const MODES: PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'cheque']
const TYPES: StaffPaymentType[] = ['salary', 'advance', 'bonus', 'deduction']

export function EditStaffPaymentForm({ payment }: { payment: StaffPayment }) {
  const t = useT()

  return (
    <ActionForm action={updateStaffPayment} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={payment.id} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('common.date')} required>
          <Input
            name="payment_date"
            type="date"
            required
            defaultValue={payment.payment_date}
          />
        </Field>
        <Field label={t('common.category')} required>
          <Select name="type" required defaultValue={payment.type}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`staff.type.${ty}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.amount')} required>
          <NumberInput name="amount" step="0.01" required defaultValue={payment.amount} />
        </Field>
        <Field label={t('staff.month')}>
          <Input
            name="period_month"
            type="month"
            defaultValue={payment.period_month ? payment.period_month.slice(0, 7) : ''}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.mode')} required>
          <Select name="mode" required defaultValue={payment.mode}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(`mode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.notes')}>
          <Textarea name="notes" rows={1} defaultValue={payment.notes ?? ''} />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
