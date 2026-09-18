'use client'

import { useT } from '@/lib/i18n/client'
import type { CngSupply, CngSupplyCost, FuelType, Staff } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addDispenser, recordSupply } from './actions'

export function SupplyForm({
  today,
  canSeeCost,
  staff,
  supply,
  cost,
}: {
  today: string
  canSeeCost: boolean
  staff: Staff[]
  supply?: CngSupply
  cost?: CngSupplyCost | null
}) {
  const t = useT()
  const editing = Boolean(supply)

  return (
    <ActionForm
      action={recordSupply}
      onDone={t('counter.done')}
      resetOnSuccess={!editing}
    >
      <input type="hidden" name="id" value={supply?.id ?? ''} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('common.date')} required>
          <Input
            name="supply_date"
            type="date"
            required
            defaultValue={supply?.supply_date ?? today}
          />
        </Field>
        <Field label={t('stock.tanker')}>
          <Input
            name="tanker_number"
            className="uppercase tabular"
            defaultValue={supply?.tanker_number ?? ''}
          />
        </Field>
        <Field label={t('cng.challanKg')} hint={t('cng.challanKgHint')}>
          <NumberInput
            name="invoice_kg"
            step="0.001"
            defaultValue={supply?.invoice_kg ?? ''}
          />
        </Field>
        <Field label={t('cng.kgReceived')} required hint={t('cng.kgReceivedHint')}>
          <NumberInput
            name="kg_received"
            step="0.001"
            required
            defaultValue={supply?.kg_received ?? ''}
          />
        </Field>
      </div>

      {canSeeCost ? (
        <div className="rounded-[22px] bg-accent-100 p-4">
          <div className="mb-3 text-[12.5px] font-semibold text-accent-800">
            {t('rep.ownerOnly')} — {t('cng.gasCost')}
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label={t('stock.supplier')}>
              <Input name="supplier" defaultValue={cost?.supplier ?? ''} />
            </Field>
            <Field label={t('inv.number')}>
              <Input
                name="invoice_number"
                defaultValue={supply?.invoice_number ?? ''}
              />
            </Field>
            <Field label={t('cng.ratePerKg')}>
              <NumberInput
                name="rate_per_kg"
                step="0.001"
                defaultValue={cost?.rate_per_kg ?? ''}
              />
            </Field>
            <Field label={t('stock.vatRate')} hint={t('stock.vatHint')}>
              <NumberInput name="vat_rate" step="0.001" defaultValue={cost?.vat_rate ?? ''} />
            </Field>
          </div>
        </div>
      ) : (
        <Alert tone="accent">{t('cng.ownerOnlyGas')}</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Received by" hint={t('common.optional')}>
          <Select name="received_by" defaultValue={supply?.received_by ?? ''}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.notes')}>
          <Textarea name="notes" rows={2} defaultValue={supply?.notes ?? ''} />
        </Field>
      </div>

      <div>
        <SubmitButton size="md">
          {editing ? t('common.save') : t('common.add')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

export function DispenserForm({ fuels }: { fuels: FuelType[] }) {
  const t = useT()

  return (
    <ActionForm action={addDispenser} onDone={t('counter.done')} resetOnSuccess>
      <input type="hidden" name="fuel_type_id" value={fuels[0]?.id ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} required>
          <Input name="name" required placeholder="C1" />
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
