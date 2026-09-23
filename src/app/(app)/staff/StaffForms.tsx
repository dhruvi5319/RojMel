'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import type { PaymentMode, Staff, StaffPaymentType } from '@/lib/database.types'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { rotationRoleOn, SHIFTS } from '@/lib/shifts'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addStaff, payStaff, updateStaff } from './actions'

const MODES: PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'cheque']
const TYPES: StaffPaymentType[] = ['salary', 'advance', 'bonus', 'deduction']


/**
 * "Normally on" is one control with three shapes: nothing fixed, a fixed Day
 * or Night, or rotating weekly — and rotating asks a second question,
 * which shift they are on right now, because that is the one thing the
 * system cannot work out for you the first time it is told.
 */
function NormallyOnField({
  initialMode,
  initialWeek,
}: {
  initialMode: '' | 'Day' | 'Night' | 'rotate'
  /** ignored unless initialMode is 'rotate' */
  initialWeek: 'Day' | 'Night'
}) {
  const t = useT()
  const [mode, setMode] = useState(initialMode)

  return (
    <>
      <Field label={t('staff.normallyOn')} hint={mode === 'rotate' ? undefined : t('staff.normallyOnHint')}>
        <Select
          name="shift_mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="">—</option>
          {SHIFTS.map((sh) => (
            <option key={sh.name} value={sh.name}>
              {t(sh.key)}
            </option>
          ))}
          <option value="rotate">{t('staff.rotates')}</option>
        </Select>
      </Field>
      {mode === 'rotate' ? (
        <Field label={t('staff.thisWeek')} hint={t('staff.thisWeekHint')} required>
          <Select name="rotation_this_week" defaultValue={initialWeek} required>
            {SHIFTS.map((sh) => (
              <option key={sh.name} value={sh.name}>
                {t(sh.key)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
    </>
  )
}

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
      <div className="grid gap-4 sm:grid-cols-2">
        <NormallyOnField initialMode="" initialWeek="Day" />
        <Field label={t('staff.pin')} hint={t('staff.pinHint')}>
          <Input name="pin" inputMode="numeric" maxLength={4} pattern="\d{4}" />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function EditStaffForm({ member, today }: { member: Staff; today: string }) {
  const t = useT()
  const initialMode = member.rotates ? 'rotate' : ((member.default_shift ?? '') as '' | 'Day' | 'Night')
  const initialWeek =
    member.rotates && member.rotation_role && member.rotation_set_on
      ? rotationRoleOn(member.rotation_role as 'Day' | 'Night', member.rotation_set_on, today)
      : 'Day'
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
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Which shift this filler normally works. The shift is seeded from
            this when it opens; changing it afterwards does not rewrite who
            was standing there. A rotating filler's pre-filled answer here is
            always today's already-correct one, so re-saving without touching
            it changes nothing about which weeks come out Day or Night. */}
        <NormallyOnField initialMode={initialMode} initialWeek={initialWeek} />
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
