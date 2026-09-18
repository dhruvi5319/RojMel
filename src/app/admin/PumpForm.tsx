'use client'

import { useT } from '@/lib/i18n/client'
import { Field, Input } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { createPump } from './actions'

/**
 * The only thing a super admin does: start a pump off with an owner who can
 * then run it without them. Everything inside the pump — managers, fillers,
 * prices, the books — belongs to that owner.
 */
export function PumpForm() {
  const t = useT()
  return (
    <ActionForm action={createPump} onDone={t('acc.pumpMade')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('acc.pumpName')} required>
          <Input name="name" required />
        </Field>
        <Field label={"Legal name"} hint={t('common.optional')}>
          <Input name="legal_name" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={"City"}>
          <Input name="city" />
        </Field>
        <Field label={"State"}>
          <Input name="state" defaultValue="Gujarat" />
        </Field>
        <Field label={"PIN code"}>
          <Input name="pincode" className="tabular" />
        </Field>
        <Field label={"Invoice prefix"} hint={t('common.optional')}>
          <Input name="invoice_prefix" className="uppercase" placeholder="RP" />
        </Field>
      </div>
      <Field label={t('cust.address')} hint={t('common.optional')}>
        <Input name="address" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cust.gstin')} hint={t('common.optional')}>
          <Input name="gstin" className="uppercase tabular" />
        </Field>
        <Field label={t('common.phone')} hint={t('common.optional')}>
          <Input name="phone" />
        </Field>
      </div>

      <div className="rounded-lg border border-accent/30 bg-accent-100 p-4">
        <div className="mb-3 text-sm font-semibold text-accent">{t('role.owner')}</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('acc.ownerName')} required>
            <Input name="owner_name" required />
          </Field>
          <Field label={t('acc.ownerEmail')} required>
            <Input name="owner_email" type="email" required autoComplete="off" />
          </Field>
          <Field
            label={t('acc.firstPassword')}
            required
            hint={t('acc.firstPasswordHint')}
          >
            <Input
              name="owner_password"
              type="text"
              required
              minLength={8}
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      <div>
        <SubmitButton size="md">{t('acc.newPump')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
