'use client'

import { useT } from '@/lib/i18n/client'
import type { CreditSale } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { SHIFTS } from '@/lib/shifts'
import { updateCreditSale } from './actions'

/** Corrects a slip. Once it is on an invoice the figures are frozen. */
export function EditSlipForm({
  slip,
  shiftName,
}: {
  slip: CreditSale
  /** The name of the shift it is on now, if any. */
  shiftName?: string | null
}) {
  const t = useT()

  if (slip.invoice_id) {
    return <Alert tone="accent">{t('credit.billedLocked')}</Alert>
  }

  return (
    <ActionForm action={updateCreditSale} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={slip.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.date')} required>
          <Input
            name="business_date"
            type="date"
            required
            defaultValue={slip.business_date}
          />
        </Field>
        <Field label={t('common.quantity')} required>
          <NumberInput name="quantity" step="0.001" required defaultValue={slip.quantity} />
        </Field>
        <Field label={t('common.rate')} required>
          <NumberInput
            name="sale_rate"
            step="0.001"
            required
            defaultValue={slip.sale_rate}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('cust.vehicleNo')}>
          <Input
            name="vehicle_number"
            className="uppercase tabular"
            defaultValue={slip.vehicle_number ?? ''}
          />
        </Field>
        <Field label={t('credit.driver')}>
          <Input name="driver_name" defaultValue={slip.driver_name ?? ''} />
        </Field>
        <Field label={t('credit.slipNo')}>
          <Input name="slip_number" defaultValue={slip.slip_number ?? ''} />
        </Field>
      </div>
      {/* Moving a slip between shifts moves money between two fillers, which
          is exactly why it must be correctable here. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('shift.name')} required hint={t('credit.shiftHint')}>
          <Select name="shift_name" required defaultValue={shiftName ?? SHIFTS[0].name}>
            {SHIFTS.map((sh) => (
              <option key={sh.name} value={sh.name}>
                {t(sh.key)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
