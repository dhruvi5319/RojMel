'use client'

import { useT } from '@/lib/i18n/client'
import type { PaymentMode, Staff, StaffPaymentType } from '@/lib/database.types'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addStaff, payStaff, updateStaff } from './actions'

const MODES: PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'cheque']
const TYPES: StaffPaymentType[] = ['salary', 'advance', 'bonus', 'deduction']

export function AddStaffForm() {
  const t = useT()
  return (
    <ActionForm action={addStaff} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="name" required />
        </Field>
        <Field label={`${t('common.name')} (ગુજરાતી)`} hint={t('common.optional')}>
          <Input name="name_gu" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.phone')}>
          <Input name="phone" type="tel" inputMode="tel" />
        </Field>
        <Field label={t('staff.salary')}>
          <NumberInput name="monthly_salary" step="0.01" defaultValue={0} />
        </Field>
        <Field label={t('staff.joined')}>
          <Input name="joined_on" type="date" />
        </Field>
      </div>
      <Field label={t('staff.pin')} hint={t('staff.pinHint')}>
        <Input name="pin" inputMode="numeric" maxLength={4} pattern="\d{4}" />
      </Field>
      <div>
        <SubmitButton size="md">{t('common.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function EditStaffForm({ member }: { member: Staff }) {
  const t = useT()
  return (
    <ActionForm action={updateStaff} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={member.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="name" required defaultValue={member.name} />
        </Field>
        <Field label={`${t('common.name')} (ગુજરાતી)`}>
          <Input name="name_gu" defaultValue={member.name_gu ?? ''} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.phone')}>
          <Input name="phone" defaultValue={member.phone ?? ''} />
        </Field>
        <Field label={t('staff.salary')}>
          <NumberInput
            name="monthly_salary"
            step="0.01"
            defaultValue={member.monthly_salary}
          />
        </Field>
        <Field label={t('staff.pin')} hint={t('staff.pinHint')}>
          <Input
            name="pin"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            defaultValue={member.pin ?? ''}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={member.is_active}
          className="size-4 accent-[var(--brand)]"
        />
        <span className="text-sm font-medium">Still working here</span>
      </label>
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function PayStaffForm({ staff, today }: { staff: Staff[]; today: string }) {
  const t = useT()
  return (
    <ActionForm action={payStaff} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('staff.title')} required>
          <Select name="staff_id" required>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.date')} required>
          <Input name="payment_date" type="date" required defaultValue={today} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.category')} required>
          <Select name="type" required defaultValue="salary">
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`staff.type.${ty}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.amount')} required>
          <NumberInput name="amount" step="0.01" required />
        </Field>
        <Field label={t('staff.month')} hint={t('common.optional')}>
          <Input name="period_month" type="month" defaultValue={today.slice(0, 7)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.mode')} required>
          <Select name="mode" required defaultValue="cash">
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(`mode.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.notes')}>
          <Textarea name="notes" rows={1} />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
