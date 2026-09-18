'use client'

import { useT } from '@/lib/i18n/client'
import { Field, Input } from '@/components/ui'
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
        <Input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('acc.newPassword')} required hint={t('acc.passwordRules')}>
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t('acc.repeatPassword')} required>
          <Input
            name="password_again"
            type="password"
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
