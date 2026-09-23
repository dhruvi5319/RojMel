'use client'

import { useT } from '@/lib/i18n/client'
import type { FuelType, Station, Tank } from '@/lib/database.types'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addFuelType, addNozzle, addTank, updateStation } from './actions'

export function StationForm({ station }: { station: Station }) {
  const t = useT()
  return (
    <ActionForm action={updateStation} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={station.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="name" required defaultValue={station.name} />
        </Field>
        <Field label="Legal name" hint="As it should read on an invoice">
          <Input name="legal_name" defaultValue={station.legal_name ?? ''} />
        </Field>
      </div>
      <Field label={t('cust.address')}>
        <Textarea name="address" defaultValue={station.address ?? ''} rows={2} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City">
          <Input name="city" defaultValue={station.city ?? ''} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={station.state ?? ''} />
        </Field>
        <Field label="PIN code">
          <Input name="pincode" inputMode="numeric" defaultValue={station.pincode ?? ''} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('cust.gstin')}>
          <Input name="gstin" defaultValue={station.gstin ?? ''} />
        </Field>
        <Field label={t('common.phone')}>
          <Input name="phone" defaultValue={station.phone ?? ''} />
        </Field>
        <Field label="Invoice prefix" hint="e.g. RP gives RP/2026-27/0001">
          <Input name="invoice_prefix" defaultValue={station.invoice_prefix} />
        </Field>
      </div>

      {/* When the shifts change over. The day shift's time is also when the
          pump's working day rolls, so a slip written before it belongs to the
          night that started the evening before. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('set.dayStarts')} hint={t('set.shiftHoursHint')} required>
          <Input
            name="day_starts_at"
            type="time"
            required
            defaultValue={station.day_starts_at?.slice(0, 5)}
          />
        </Field>
        <Field label={t('set.nightStarts')} required>
          <Input
            name="night_starts_at"
            type="time"
            required
            defaultValue={station.night_starts_at?.slice(0, 5)}
          />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function FuelForm() {
  const t = useT()
  return (
    <ActionForm action={addFuelType} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="name" required placeholder="Petrol" />
        </Field>
        <Field label={`${t('common.name')} (ગુજરાતી)`}>
          <Input name="name_gu" placeholder="પેટ્રોલ" />
        </Field>
      </div>
      {/* Litres or kilograms, chosen once here — the edit form only ever
          shows it back, fixed, because a sale already priced against one
          unit cannot be quietly remeasured in the other. Without a choice
          here every fuel silently became litres, CNG included, and the CNG
          page's own instructions ("add a fuel measured in kilograms") had no
          way to be followed. */}
      <Field label={t('set.unit')} hint={t('set.unitHint')} required>
        <Select name="unit" defaultValue="L" required>
          <option value="L">{t('set.unitLitres')}</option>
          <option value="kg">{t('set.unitKg')}</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('set.currentRate')}>
          <NumberInput name="sale_rate" step="0.001" />
        </Field>
        <Field label="Order">
          <NumberInput name="sort_order" step="1" defaultValue={0} />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function TankForm({ fuels }: { fuels: FuelType[] }) {
  const t = useT()
  return (
    <ActionForm action={addTank} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="name" required placeholder="Tank 1 Diesel" />
        </Field>
        <Field label={t('set.fuels')} required>
          <Select name="fuel_type_id" required>
            {fuels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('stock.capacity')}>
          <NumberInput name="capacity_litres" step="1" />
        </Field>
        <Field label={t('cust.openingBalance')} hint="Litres in the tank on day one">
          <NumberInput name="opening_stock_litres" step="0.001" />
        </Field>
        <Field label={t('set.effectiveFrom')}>
          <Input name="opening_stock_date" type="date" />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function NozzleForm({ tanks }: { tanks: Tank[] }) {
  const t = useT()
  return (
    <ActionForm action={addNozzle} onDone={t('counter.done')} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.name')} required>
          <Input name="name" required placeholder="D1" />
        </Field>
        <Field label={t('stock.tank')} required>
          <Select name="tank_id" required>
            {tanks.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Order">
          <NumberInput name="sort_order" step="1" defaultValue={0} />
        </Field>
      </div>
      <div>
        <SubmitButton size="md">{t('common.add')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
