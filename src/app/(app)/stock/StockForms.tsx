'use client'

import { useT } from '@/lib/i18n/client'
import type { Staff, Tank } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { recordDelivery, recordDip } from './actions'

export function DeliveryForm({
  tanks,
  staff,
  today,
  canSeeCost,
}: {
  tanks: Tank[]
  staff: Staff[]
  today: string
  canSeeCost: boolean
}) {
  const t = useT()

  return (
    <ActionForm action={recordDelivery} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('stock.tank')} required>
          <Select name="tank_id" required>
            {tanks.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.date')} required>
          <Input name="delivery_date" type="date" required defaultValue={today} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.litres')} required>
          <NumberInput name="litres" step="0.001" required />
        </Field>
        <Field label={t('stock.tanker')}>
          <Input name="tanker_number" className="uppercase tabular" />
        </Field>
        <Field label="Density" hint={t('common.optional')}>
          <NumberInput name="density" step="0.001" />
        </Field>
      </div>

      <Field label="Received by" hint={t('common.optional')}>
        <Select name="received_by">
          <option value="">—</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      {canSeeCost ? (
        <div className="rounded-lg border border-accent/30 bg-accent-soft p-4">
          <div className="mb-3 text-sm font-semibold text-accent">
            {t('rep.ownerOnly')} — {t('stock.purchaseRate')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('stock.supplier')}>
              <Input name="supplier" />
            </Field>
            <Field label={t('inv.number')}>
              <Input name="invoice_number" />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('stock.purchaseRate')}>
              <NumberInput name="rate_per_litre" step="0.001" />
            </Field>
            <Field label={t('common.date')}>
              <Input name="invoice_date" type="date" />
            </Field>
          </div>
        </div>
      ) : (
        <Alert tone="brand">{t('stock.ownerOnlyCost')}</Alert>
      )}

      <Field label={t('common.notes')}>
        <Textarea name="notes" rows={2} />
      </Field>

      <div>
        <SubmitButton size="md">{t('common.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function DipForm({ tanks, today }: { tanks: Tank[]; today: string }) {
  const t = useT()

  return (
    <ActionForm action={recordDip} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('stock.tank')} required>
          <Select name="tank_id" required>
            {tanks.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.date')} required>
          <Input name="business_date" type="date" required defaultValue={today} />
        </Field>
        <Field label={t('stock.dip')} required>
          <NumberInput name="dip_litres" step="0.001" required />
        </Field>
      </div>
      <Field label={t('common.notes')}>
        <Textarea name="notes" rows={2} />
      </Field>
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
