'use client'

import { useT } from '@/lib/i18n/client'
import type { CngSupply, CngSupplyCost, FuelType } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { addDispenser, recordSupply } from './actions'

export function SupplyForm({
  today,
  canSeeCost,
  supply,
  cost,
}: {
  today: string
  canSeeCost: boolean
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
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('common.date')} required>
          <Input
            name="supply_date"
            type="date"
            required
            defaultValue={supply?.supply_date ?? today}
          />
        </Field>
        <Field label={t('cng.openingScm')} hint={t('cng.inletHint')}>
          <NumberInput
            name="opening_scm"
            step="0.001"
            defaultValue={supply?.opening_scm ?? ''}
          />
        </Field>
        <Field label={t('cng.closingScm')}>
          <NumberInput
            name="closing_scm"
            step="0.001"
            defaultValue={supply?.closing_scm ?? ''}
          />
        </Field>
        <Field label={t('cng.scmReceived')} required>
          <NumberInput
            name="scm_received"
            step="0.001"
            required
            defaultValue={supply?.scm_received ?? ''}
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
              <Input name="supplier" defaultValue={cost?.supplier ?? 'Gujarat Gas'} />
            </Field>
            <Field label={t('inv.number')}>
              <Input
                name="invoice_number"
                defaultValue={supply?.invoice_number ?? ''}
              />
            </Field>
            <Field label={t('cng.ratePerScm')}>
              <NumberInput
                name="rate_per_scm"
                step="0.001"
                defaultValue={cost?.rate_per_scm ?? ''}
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

      <Field label={t('common.notes')}>
        <Textarea name="notes" rows={2} defaultValue={supply?.notes ?? ''} />
      </Field>

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
