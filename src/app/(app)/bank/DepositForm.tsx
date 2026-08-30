'use client'

import { useT } from '@/lib/i18n/client'
import type { BankDeposit, Profile } from '@/lib/database.types'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addDeposit, updateDeposit } from './actions'

export function DepositForm({
  today,
  people,
  defaultDepositor,
  suggestedAmount,
  deposit,
}: {
  today: string
  people: Profile[]
  defaultDepositor: string
  suggestedAmount: number
  deposit?: BankDeposit
}) {
  const t = useT()
  const editing = Boolean(deposit)

  return (
    <ActionForm
      action={editing ? updateDeposit : addDeposit}
      onDone={t('counter.done')}
      resetOnSuccess={!editing}
    >
      {deposit ? <input type="hidden" name="id" value={deposit.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.date')} required>
          <Input
            name="deposit_date"
            type="date"
            required
            defaultValue={deposit?.deposit_date ?? today}
          />
        </Field>
        <Field
          label={t('common.amount')}
          required
          hint={
            suggestedAmount > 0
              ? `${t('bank.undeposited')}: ₹${suggestedAmount.toFixed(2)}`
              : undefined
          }
        >
          <NumberInput
            name="amount"
            step="0.01"
            required
            defaultValue={deposit?.amount ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('bank.bankName')} required>
          <Input name="bank_name" required defaultValue={deposit?.bank_name ?? ''} />
        </Field>
        <Field label="Account (last 4)" hint={t('common.optional')}>
          <Input
            name="account_last4"
            inputMode="numeric"
            maxLength={4}
            defaultValue={deposit?.account_last4 ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('bank.slip')}>
          <Input name="slip_reference" defaultValue={deposit?.slip_reference ?? ''} />
        </Field>
        <Field label={t('bank.depositedBy')}>
          <Select
            name="deposited_by"
            defaultValue={deposit?.deposited_by ?? defaultDepositor}
          >
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t('common.notes')}>
        <Textarea name="notes" defaultValue={deposit?.notes ?? ''} />
      </Field>

      <div>
        <SubmitButton size="md">
          {editing ? t('common.save') : t('common.add')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
