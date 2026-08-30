'use client'

import { useT } from '@/lib/i18n/client'
import type { Expense, PaymentMode } from '@/lib/database.types'
import { Field, Input, NumberInput, Select } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addExpense, updateExpense } from './actions'

const MODES: PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'cheque', 'card']

/** Common enough at a pump to be worth offering, still free text. */
const CATEGORIES = [
  'Electricity', 'Repairs & maintenance', 'Rent', 'Municipal & licence',
  'Diesel generator', 'Stationery', 'Tea & food', 'Transport', 'Bank charges',
  'Cleaning', 'Other',
]

export function ExpenseForm({
  today,
  expense,
}: {
  today: string
  expense?: Expense
}) {
  const t = useT()
  const editing = Boolean(expense)

  return (
    <ActionForm
      action={editing ? updateExpense : addExpense}
      onDone={t('counter.done')}
      resetOnSuccess={!editing}
    >
      {expense ? <input type="hidden" name="id" value={expense.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.date')} required>
          <Input
            name="business_date"
            type="date"
            required
            defaultValue={expense?.business_date ?? today}
          />
        </Field>
        <Field label={t('common.category')} required>
          <Input
            name="category"
            list="expense-categories"
            required
            defaultValue={expense?.category ?? ''}
          />
          <datalist id="expense-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.amount')} required>
          <NumberInput
            name="amount"
            step="0.01"
            required
            defaultValue={expense?.amount ?? ''}
          />
        </Field>
        <Field label={t('common.mode')} required>
          <Select name="mode" required defaultValue={expense?.mode ?? 'cash'}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(`mode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('exp.paidTo')}>
          <Input name="paid_to" defaultValue={expense?.paid_to ?? ''} />
        </Field>
        <Field label={t('common.description')}>
          <Input name="description" defaultValue={expense?.description ?? ''} />
        </Field>
      </div>

      <div>
        <SubmitButton size="md">
          {editing ? t('common.save') : t('common.add')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
