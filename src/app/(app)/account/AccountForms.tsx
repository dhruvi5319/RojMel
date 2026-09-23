'use client'

import { useT } from '@/lib/i18n/client'
import { Field } from '@/components/ui'
import { PasswordInput } from '@/components/PasswordInput'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { changeMyPassword } from './actions'

export function ChangePasswordForm() {
  const t = useT()
  return (
    <ActionForm
      action={changeMyPassword}
      onDone={t('acc.passwordChanged')}
      resetOnSuccess
    >
      <Field label={t('acc.currentPassword')} required>
        <PasswordInput name="current_password" required autoComplete="current-password" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('acc.newPassword')} required hint={t('acc.passwordRules')}>
          <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label={t('acc.repeatPassword')} required>
          <PasswordInput
            name="password_again"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('acc.myPassword')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
