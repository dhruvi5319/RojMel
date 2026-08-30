'use client'

import { useT } from '@/lib/i18n/client'
import type { FuelPurchase, FuelPurchaseCost } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { updateDelivery } from './actions'

export function EditDeliveryForm({
  delivery,
  cost,
  canSeeCost,
}: {
  delivery: FuelPurchase
  cost: FuelPurchaseCost | null
  canSeeCost: boolean
}) {
  const t = useT()

  return (
    <ActionForm action={updateDelivery} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={delivery.id} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('common.date')} required>
          <Input
            name="delivery_date"
            type="date"
            required
            defaultValue={delivery.delivery_date}
          />
        </Field>
        <Field label={t('common.litres')} required>
          <NumberInput name="litres" step="0.001" required defaultValue={delivery.litres} />
        </Field>
        <Field label={t('stock.tanker')}>
          <Input
            name="tanker_number"
            className="uppercase tabular"
            defaultValue={delivery.tanker_number ?? ''}
          />
        </Field>
        <Field label="Density">
          <NumberInput name="density" step="0.001" defaultValue={delivery.density ?? ''} />
        </Field>
      </div>

      {canSeeCost ? (
        <div className="rounded-lg border border-accent/30 bg-accent-100 p-4">
          <div className="mb-3 text-sm font-semibold text-accent">
            {t('rep.ownerOnly')} — {t('stock.purchaseRate')}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('stock.supplier')}>
              <Input name="supplier" defaultValue={cost?.supplier ?? ''} />
            </Field>
            <Field label={t('inv.number')}>
              <Input name="invoice_number" defaultValue={cost?.invoice_number ?? ''} />
            </Field>
            <Field label={t('stock.purchaseRate')}>
              <NumberInput
                name="rate_per_litre"
                step="0.001"
                defaultValue={cost?.rate_per_litre ?? ''}
              />
            </Field>
          </div>
        </div>
      ) : (
        <Alert tone="accent">{t('stock.ownerOnlyCost')}</Alert>
      )}

      <Field label={t('common.notes')}>
        <Textarea name="notes" rows={2} defaultValue={delivery.notes ?? ''} />
      </Field>

      <div>
        <SubmitButton size="md">{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
