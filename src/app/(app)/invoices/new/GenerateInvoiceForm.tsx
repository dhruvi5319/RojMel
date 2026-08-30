'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import type { CustomerBalance } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { generateInvoice } from '../actions'

export function GenerateInvoiceForm({
  customers,
  preselected,
  defaultFrom,
  defaultTo,
}: {
  customers: CustomerBalance[]
  preselected: string
  defaultFrom: string
  defaultTo: string
}) {
  const t = useT()
  const [customerId, setCustomerId] = useState(preselected)
  const customer = customers.find((c) => c.customer_id === customerId)

  return (
    <ActionForm action={generateInvoice}>
      <Field label={t('cust.title')} required>
        <Select
          name="customer_id"
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">—</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name}
              {c.unbilled_amount > 0
                ? ` — ${c.unbilled_slips} unbilled`
                : ''}
            </option>
          ))}
        </Select>
      </Field>

      {customer ? (
        <Alert tone={customer.unbilled_amount > 0 ? 'accent' : 'accent'}>
          {customer.unbilled_amount > 0 ? (
            <>
              {t('credit.unbilled')}: <strong>{money(customer.unbilled_amount)}</strong>{' '}
              ({customer.unbilled_slips})
            </>
          ) : (
            t('inv.noUnbilled')
          )}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.from')} required>
          <Input name="period_from" type="date" required defaultValue={defaultFrom} />
        </Field>
        <Field label={t('common.to')} required>
          <Input name="period_to" type="date" required defaultValue={defaultTo} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`${t('inv.tax')} %`}
          hint="Leave at 0 unless you bill fuel with GST"
        >
          <NumberInput name="tax_rate" step="0.01" defaultValue={0} />
        </Field>
        <Field label={`${t('inv.dueDate')} (days)`}>
          <NumberInput name="due_days" step="1" defaultValue={15} />
        </Field>
      </div>

      <div>
        <SubmitButton>{t('inv.generate')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
