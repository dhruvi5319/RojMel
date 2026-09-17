'use client'

import { useT } from '@/lib/i18n/client'
import type { Shift, Staff, Tank } from '@/lib/database.types'
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

      {/* Three quantities, kept apart — a shortage argument turns on them. */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('stock.ordered')} hint={t('stock.orderedHint')}>
          <NumberInput name="ordered_litres" step="0.001" />
        </Field>
        <Field label={t('stock.challan')} hint={t('stock.challanHint')}>
          <NumberInput name="invoice_litres" step="0.001" />
        </Field>
        <Field label={t('stock.tankerDip')} hint={t('stock.tankerDipHint')}>
          <NumberInput name="tanker_dip_litres" step="0.001" />
        </Field>
        <Field label={t('stock.received')} required hint={t('stock.receivedHint')}>
          <NumberInput name="litres" step="0.001" required />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('stock.tanker')}>
          <Input name="tanker_number" className="uppercase tabular" />
        </Field>
        <Field label={t('stock.seal')}>
          <Input name="seal_number" className="uppercase tabular" />
        </Field>
        <Field label="Density" hint={t('common.optional')}>
          <NumberInput name="density" step="0.001" />
        </Field>
        <Field label={t('stock.temperature')} hint={t('common.optional')}>
          <NumberInput name="temperature_c" step="0.1" />
        </Field>
      </div>

      {/* The tank either side of decanting, when both dips are taken. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('stock.dipBefore')}>
          <NumberInput name="dip_before_litres" step="0.001" />
        </Field>
        <Field label={t('stock.dipAfter')}>
          <NumberInput name="dip_after_litres" step="0.001" />
        </Field>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            name="seals_intact"
            defaultChecked
            className="size-4 accent-[var(--color-accent)]"
          />
          {t('stock.sealsIntact')}
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            name="water_check_ok"
            defaultChecked
            className="size-4 accent-[var(--color-accent)]"
          />
          {t('stock.waterCheck')}
        </label>
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
        <div className="rounded-lg border border-accent/30 bg-accent-100 p-4">
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
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={t('stock.purchaseRate')}>
              <NumberInput name="rate_per_litre" step="0.001" />
            </Field>
            <Field label={t('stock.vatRate')} hint={t('stock.vatHint')}>
              <NumberInput name="vat_rate" step="0.001" />
            </Field>
            <Field label={t('common.date')}>
              <Input name="invoice_date" type="date" />
            </Field>
          </div>
        </div>
      ) : (
        <Alert tone="accent">{t('stock.ownerOnlyCost')}</Alert>
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

export function DipForm({
  tanks,
  today,
  shifts,
}: {
  tanks: Tank[]
  today: string
  shifts: Shift[]
}) {
  const t = useT()

  return (
    <ActionForm action={recordDip} onDone={t('counter.done')} resetOnSuccess>
      <Field label={t('shift.name')} hint={t('stock.dipShiftHint')}>
        <Select name="shift_id" defaultValue="">
          <option value="">{t('stock.dayEnd')}</option>
          {shifts.map((sh) => (
            <option key={sh.id} value={sh.id}>
              {sh.name}
            </option>
          ))}
        </Select>
      </Field>
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
