'use client'

import { useT } from '@/lib/i18n/client'
import type { Payment, PaymentMode } from '@/lib/database.types'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { updatePayment } from './actions'

const MODES: PaymentMode[] = ['cash', 'upi', 'cheque', 'bank_transfer', 'card']

/**
 * Corrects a receipt in place. Which customer and which invoice it belongs to
 * are deliberately not editable — moving money between accounts should be a
 * delete and a fresh entry, so the trail stays honest.
 */
export function EditPaymentForm({ payment }: { payment: Payment }) {
  const t = useT()

  return (
    <ActionForm action={updatePayment} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={payment.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.date')} required>
          <Input
            name="payment_date"
            type="date"
            required
            defaultValue={payment.payment_date}
          />
        </Field>
        <Field label={t('common.amount')} required>
          <NumberInput name="amount" step="0.01" required defaultValue={payment.amount} />
        </Field>
        <Field label={t('common.mode')} required>
          <Select name="mode" required defaultValue={payment.mode}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(`mode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.reference')}>
          <Input name="reference" defaultValue={payment.reference ?? ''} />
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
