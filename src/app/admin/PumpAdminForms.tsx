'use client'

import { useT } from '@/lib/i18n/client'
import type { UserRole } from '@/lib/database.types'
import { Badge, Field, Input } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { Collapsible } from '@/components/Collapsible'
import { resetPumpAccountPassword, setPumpActive, updatePump } from './actions'

export interface AdminPump {
  station_id: string
  name: string
  legal_name: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  gstin: string | null
  phone: string | null
  invoice_prefix: string
  created_at: string
  owners: number
  managers: number
  has_counter: boolean
  is_active: boolean
}

export interface AdminAccount {
  user_id: string
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

const roleKey = {
  owner: 'role.owner',
  manager: 'role.manager',
  counter: 'role.counter',
} as const

/** Everything the creation form typed in, fixed afterward. */
export function EditPumpForm({ pump }: { pump: AdminPump }) {
  const t = useT()
  return (
    <ActionForm action={updatePump} onDone={t('counter.done')}>
      <input type="hidden" name="station_id" value={pump.station_id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('acc.pumpName')} required>
          <Input name="name" required defaultValue={pump.name} />
        </Field>
        <Field label="Legal name" hint={t('common.optional')}>
          <Input name="legal_name" defaultValue={pump.legal_name ?? ''} />
        </Field>
      </div>
      <Field label={t('cust.address')} hint={t('common.optional')}>
        <Input name="address" defaultValue={pump.address ?? ''} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="City">
          <Input name="city" defaultValue={pump.city ?? ''} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={pump.state ?? ''} />
        </Field>
        <Field label="PIN code">
          <Input name="pincode" className="tabular" defaultValue={pump.pincode ?? ''} />
        </Field>
        <Field label="Invoice prefix" hint={t('common.optional')}>
          <Input
            name="invoice_prefix"
            className="uppercase"
            defaultValue={pump.invoice_prefix}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cust.gstin')} hint={t('common.optional')}>
          <Input name="gstin" className="uppercase tabular" defaultValue={pump.gstin ?? ''} />
        </Field>
        <Field label={t('common.phone')} hint={t('common.optional')}>
          <Input name="phone" defaultValue={pump.phone ?? ''} />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** Retiring or restoring a whole pump, in one button — same shape as
    AccountActive on /people, just for the station instead of one login. */
export function PumpActive({
  stationId,
  active,
}: {
  stationId: string
  active: boolean
}) {
  const t = useT()
  return (
    <ActionForm
      action={setPumpActive}
      className="inline"
      onDone={null}
      stayOpen
      alwaysReady
    >
      <input type="hidden" name="station_id" value={stationId} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <SubmitButton size="sm" variant={active ? 'danger' : 'secondary'}>
        {active ? t('acc.remove') : t('acc.restore')}
      </SubmitButton>
    </ActionForm>
  )
}

/** A forgotten password, given back by the super admin, for any account at
    any pump — not just the owner, and not just the one they just made. */
function ResetPumpPasswordForm({ userId }: { userId: string }) {
  const t = useT()
  return (
    <ActionForm action={resetPumpAccountPassword} onDone={t('acc.passwordChanged')}>
      <input type="hidden" name="user_id" value={userId} />
      <Field label={t('acc.newPassword')} required hint={t('acc.passwordRules')}>
        <Input name="password" type="text" required minLength={8} autoComplete="off" />
      </Field>
      <div>
        <SubmitButton size="sm">{t('acc.resetPassword')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** Who can sign into this pump, and a way back in for any of them. */
export function PumpAccountList({ accounts }: { accounts: AdminAccount[] }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2">
      {accounts.map((a) => (
        <div key={a.user_id} className="flex items-center gap-2">
          <Badge tone={a.role === 'owner' ? 'ok' : 'neutral'}>{t(roleKey[a.role])}</Badge>
          {!a.is_active ? <Badge>{t('acc.removed')}</Badge> : null}
          <div className="min-w-0 flex-1">
            <Collapsible title={`${a.full_name} — ${a.email}`}>
              <ResetPumpPasswordForm userId={a.user_id} />
            </Collapsible>
          </div>
        </div>
      ))}
    </div>
  )
}
