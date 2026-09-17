'use client'

import { useT } from '@/lib/i18n/client'
import type { FuelType, Nozzle, Tank } from '@/lib/database.types'
import { Field, Input, NumberInput, Select } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { updateFuelType, updateNozzle, updateTank } from './actions'

function Active({ checked }: { checked: boolean }) {
  const t = useT()
  return (
    <label className="flex items-center gap-2 text-[14px]">
      <input
        type="checkbox"
        name="is_active"
        defaultChecked={checked}
        className="size-4 accent-[var(--color-accent)]"
      />
      {t('set.inUse')}
    </label>
  )
}

export function EditFuelForm({ fuel }: { fuel: FuelType }) {
  const t = useT()
  return (
    <ActionForm action={updateFuelType} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={fuel.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.name')} required>
          <Input name="name" required defaultValue={fuel.name} />
        </Field>
        <Field label={`${t('common.name')} (ગુજરાતી)`}>
          <Input name="name_gu" defaultValue={fuel.name_gu ?? ''} />
        </Field>
        <Field label="Order">
          <NumberInput name="sort_order" step="1" defaultValue={fuel.sort_order} />
        </Field>
      </div>
      <p className="text-[12.5px] text-neutral-600">
        {t('set.unitFixed')} <strong>{fuel.unit}</strong>
      </p>
      <Active checked={fuel.is_active} />
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function EditTankForm({ tank }: { tank: Tank }) {
  const t = useT()
  return (
    <ActionForm action={updateTank} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={tank.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="name" required defaultValue={tank.name} />
        </Field>
        <Field label={t('stock.capacity')}>
          <NumberInput name="capacity_litres" step="1" defaultValue={tank.capacity_litres} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cust.openingBalance')} hint={t('set.openingStockHint')}>
          <NumberInput
            name="opening_stock_litres"
            step="0.001"
            defaultValue={tank.opening_stock_litres}
          />
        </Field>
        <Field label={t('set.effectiveFrom')}>
          <Input
            name="opening_stock_date"
            type="date"
            defaultValue={tank.opening_stock_date ?? ''}
          />
        </Field>
      </div>
      <Active checked={tank.is_active} />
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function EditNozzleForm({
  nozzle,
  tanks,
}: {
  nozzle: Nozzle
  tanks: Tank[]
}) {
  const t = useT()
  return (
    <ActionForm action={updateNozzle} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={nozzle.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.name')} required>
          <Input name="name" required defaultValue={nozzle.name} />
        </Field>
        <Field label={t('stock.tank')} required>
          <Select name="tank_id" required defaultValue={nozzle.tank_id}>
            {tanks.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Order">
          <NumberInput name="sort_order" step="1" defaultValue={nozzle.sort_order} />
        </Field>
      </div>
      <Active checked={nozzle.is_active} />
      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
