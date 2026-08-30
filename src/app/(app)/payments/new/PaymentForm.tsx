'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import type { CustomerBalance, PaymentMode } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { recordPayment } from '../actions'

const MODES: PaymentMode[] = ['cash', 'upi', 'cheque', 'bank_transfer', 'card']

interface InvoiceOption {
  id: string
  customer_id: string
  invoice_number: string
  due: number
}

export function PaymentForm({
  today,
  customers,
  invoices,
  preselectedCustomer,
  preselectedInvoice,
}: {
  today: string
  customers: CustomerBalance[]
  invoices: InvoiceOption[]
  preselectedCustomer: string
  preselectedInvoice: string
}) {
  const t = useT()
  const [customerId, setCustomerId] = useState(preselectedCustomer)
  const [invoiceId, setInvoiceId] = useState(preselectedInvoice)
  const [amount, setAmount] = useState('')

  const customer = customers.find((c) => c.customer_id === customerId)
  const theirInvoices = invoices.filter((i) => i.customer_id === customerId)
  const invoice = theirInvoices.find((i) => i.id === invoiceId)

  return (
    <ActionForm action={recordPayment}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.date')} required>
          <Input name="payment_date" type="date" required defaultValue={today} />
        </Field>
        <Field label={t('common.mode')} required>
          <Select name="mode" required defaultValue="cash">
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(`mode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t('cust.title')} required>
        <Select
          name="customer_id"
          required
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value)
            setInvoiceId('')
          }}
        >
          <option value="">—</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name} — {money(c.balance)}
            </option>
          ))}
        </Select>
      </Field>

      {customer ? (
        <Alert tone="accent">
          {t('cust.balance')}: <strong>{money(customer.balance)}</strong>
        </Alert>
      ) : null}

      <Field
        label={t('pay.against')}
        hint="Leave blank to put it on the account against the oldest dues"
      >
        <Select
          name="invoice_id"
          value={invoiceId}
          disabled={!customerId}
          onChange={(e) => {
            setInvoiceId(e.target.value)
            const inv = theirInvoices.find((i) => i.id === e.target.value)
            if (inv) setAmount(inv.due.toFixed(2))
          }}
        >
          <option value="">{t('pay.onAccount')}</option>
          {theirInvoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.invoice_number} — {money(i.due)}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.amount')} required>
          <NumberInput
            name="amount"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label={t('common.reference')} hint="Cheque or UPI reference">
          <Input name="reference" />
        </Field>
      </div>

      {invoice && Number(amount) > invoice.due + 0.5 ? (
        <Alert tone="accent">
          This is more than the {invoice.invoice_number} balance of {money(invoice.due)}.
          The extra will sit on their account.
        </Alert>
      ) : null}

      <Field label={t('common.notes')}>
        <Textarea name="notes" />
      </Field>

      <div>
        <SubmitButton>{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
