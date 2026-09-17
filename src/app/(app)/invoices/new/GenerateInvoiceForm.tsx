'use client'

import { useMemo, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import type { CustomerBalance } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { generateInvoice } from '../actions'

export interface UnbilledSlip {
  customer_id: string
  business_date: string
  amount: number
}

/**
 * The bill is made from whichever slips fall inside the dates, so the figure
 * shown has to follow the dates. It used to show the customer's whole unbilled
 * balance no matter what period was chosen, which is a good way to raise a bill
 * for the wrong amount.
 */
export function GenerateInvoiceForm({
  customers,
  unbilled,
  preselected,
}: {
  customers: CustomerBalance[]
  unbilled: UnbilledSlip[]
  preselected: string
}) {
  const t = useT()
  const [customerId, setCustomerId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  /** The dates that cover everything this customer has outstanding. */
  function spanFor(id: string) {
    const dates = unbilled
      .filter((s) => s.customer_id === id)
      .map((s) => s.business_date)
      .sort()
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null
  }

  function pick(id: string) {
    setCustomerId(id)
    const span = spanFor(id)
    setFrom(span?.from ?? '')
    setTo(span?.to ?? '')
  }

  // Fill in on first render when arriving from a customer's own page.
  const [seeded, setSeeded] = useState(false)
  if (!seeded && preselected && customers.some((c) => c.customer_id === preselected)) {
    setSeeded(true)
    pick(preselected)
  }

  const inRange = useMemo(() => {
    if (!customerId || !from || !to) return { total: 0, count: 0 }
    const rows = unbilled.filter(
      (s) => s.customer_id === customerId && s.business_date >= from && s.business_date <= to,
    )
    return {
      total: rows.reduce((sum, s) => sum + Number(s.amount), 0),
      count: rows.length,
    }
  }, [customerId, from, to, unbilled])

  const customer = customers.find((c) => c.customer_id === customerId)
  const nothing = inRange.count === 0

  return (
    <ActionForm action={generateInvoice}>
      <Field label={t('cust.title')} required>
        <Select
          name="customer_id"
          required
          value={customerId}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">—</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name} — {money(c.unbilled_amount)} ({c.unbilled_slips})
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.from')} required hint={customer ? t('inv.datesFromSlips') : undefined}>
          <Input
            name="period_from"
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={t('common.to')} required>
          <Input
            name="period_to"
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>

      {/* The number the bill will actually carry, for the dates on screen. */}
      {!customerId ? (
        <Alert tone="neutral">{t('inv.pickCustomer')}</Alert>
      ) : nothing ? (
        <Alert tone="accent">{t('inv.noUnbilled')}</Alert>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-[22px] bg-accent-200 px-5 py-4">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-accent-800 uppercase">
            {t('inv.forTheseDates')}
          </span>
          <span className="tabular font-[family-name:var(--font-heading)] text-[26px] leading-none">
            {money(inRange.total)}
          </span>
          <span className="w-full text-[12.5px] text-neutral-700">
            {inRange.count} {t('credit.title').toLowerCase()}
            {customer && inRange.total < customer.unbilled_amount
              ? ` · ${money(customer.unbilled_amount - inRange.total)} ${t('inv.outsideDates')}`
              : ''}
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t('inv.tax')} %`} hint={t('inv.taxHint')}>
          <NumberInput name="tax_rate" step="0.01" defaultValue={0} />
        </Field>
        <Field label={`${t('inv.dueDate')} (days)`}>
          <NumberInput name="due_days" step="1" defaultValue={15} />
        </Field>
      </div>

      <div>
        <SubmitButton disabled={nothing}>{t('inv.generate')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
