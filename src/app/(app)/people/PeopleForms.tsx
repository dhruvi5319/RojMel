'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import type { UserRole } from '@/lib/database.types'
import { Field, Input, Select } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addAccount, resetAccountPassword, setAccountActive } from './actions'

const ROLES: { value: UserRole; key: 'role.owner' | 'role.manager' | 'role.counter' }[] = [
  { value: 'manager', key: 'role.manager' },
  { value: 'owner', key: 'role.owner' },
  { value: 'counter', key: 'role.counter' },
]

/**
 * The owner making an account for somebody.
 *
 * It asks for a first password rather than emailing a link: a pump has one
 * shared counter device and a manager who is standing in front of you, and an
 * invitation sitting in an unread inbox is not a way to start a shift. They
 * change it themselves afterwards under My login.
 */
export function AddAccountForm() {
  const t = useT()
  const [role, setRole] = useState<UserRole>('manager')

  return (
    <ActionForm action={addAccount} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="full_name" required />
        </Field>
        <Field label={t('acc.email')} required>
          <Input name="email" type="email" required autoComplete="off" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t('acc.role')}
          required
          hint={role === 'counter' ? t('acc.counterOne') : undefined}
        >
          <Select
            name="role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.key)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.phone')} hint={t('common.optional')}>
          <Input name="phone" />
        </Field>
        <Field
          label={t('acc.firstPassword')}
          required
          hint={t('acc.firstPasswordHint')}
        >
          <Input name="password" type="text" required minLength={8} autoComplete="off" />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('acc.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** Retiring or restoring an account, in one button. */
export function AccountActive({
  userId,
  active,
}: {
  userId: string
  active: boolean
}) {
  const t = useT()
  return (
    <ActionForm action={setAccountActive} className="inline" onDone={null} stayOpen>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <SubmitButton size="sm" variant={active ? 'danger' : 'secondary'}>
        {active ? t('acc.remove') : t('acc.restore')}
      </SubmitButton>
    </ActionForm>
  )
}

/** A forgotten password, reset by the owner rather than by an administrator. */
export function ResetPasswordForm({ userId }: { userId: string }) {
  const t = useT()
  return (
    <ActionForm action={resetAccountPassword} onDone={t('acc.passwordChanged')}>
      <input type="hidden" name="user_id" value={userId} />
      <Field label={t('acc.newPassword')} required hint={t('acc.passwordRules')}>
        <Input name="password" type="text" required minLength={8} autoComplete="off" />
      </Field>
      <div>
        <SubmitButton size="md">{t('acc.resetPassword')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
