'use client'

import { useT } from '@/lib/i18n/client'
import type { Customer } from '@/lib/database.types'
import { Field, Input, NumberInput, Textarea } from '@/components/ui'

/** Shared by the create and edit forms so the two never drift apart. */
export function CustomerFields({ customer }: { customer?: Customer }) {
  const t = useT()

  return (
    <>
      <Field label={t('common.name')} required>
        <Input name="name" required defaultValue={customer?.name ?? ''} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cust.contact')}>
          <Input name="contact_person" defaultValue={customer?.contact_person ?? ''} />
        </Field>
        <Field label={t('common.phone')}>
          <Input name="phone" type="tel" inputMode="tel" defaultValue={customer?.phone ?? ''} />
        </Field>
      </div>

      <Field label={t('cust.address')}>
        <Textarea name="address" defaultValue={customer?.address ?? ''} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cust.gstin')}>
          <Input name="gstin" defaultValue={customer?.gstin ?? ''} />
        </Field>
        <Field label={t('cust.creditLimit')}>
          <NumberInput
            name="credit_limit"
            step="0.01"
            defaultValue={customer?.credit_limit ?? 0}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cust.openingBalance')} hint={t('cust.openingHint')}>
          <NumberInput
            name="opening_balance"
            step="0.01"
            defaultValue={customer?.opening_balance ?? 0}
          />
        </Field>
        <Field label={t('set.effectiveFrom')}>
          <Input
            name="opening_balance_date"
            type="date"
            defaultValue={customer?.opening_balance_date ?? ''}
          />
        </Field>
      </div>

      <Field label={t('common.notes')}>
        <Textarea name="notes" defaultValue={customer?.notes ?? ''} />
      </Field>
    </>
  )
}
