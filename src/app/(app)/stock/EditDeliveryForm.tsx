'use client'

import { useT } from '@/lib/i18n/client'
import type { Delivery, FuelPurchaseCost } from '@/lib/database.types'
import { money } from '@/lib/format'
import { Alert, Field, Input, NumberInput, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { updateDelivery } from './actions'

export function EditDeliveryForm({
  delivery,
  cost,
  canSeeCost,
}: {
  delivery: Delivery
  cost: FuelPurchaseCost | null
  canSeeCost: boolean
}) {
  const t = useT()

  return (
    <ActionForm action={updateDelivery} onDone={t('counter.done')}>
      <input type="hidden" name="id" value={delivery.id} />
      {/* The date, tanker and seals belong to the trip, so editing them here
          reaches every tank that trip filled. */}
      <input type="hidden" name="delivery_id" value={delivery.delivery_id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('stock.ordered')}>
          <NumberInput
            name="ordered_litres"
            step="0.001"
            defaultValue={delivery.ordered_litres ?? ''}
          />
        </Field>
        <Field label={t('stock.challan')}>
          <NumberInput
            name="invoice_litres"
            step="0.001"
            defaultValue={delivery.invoice_litres ?? ''}
          />
        </Field>
        <Field label={t('stock.tankerDip')}>
          <NumberInput
            name="tanker_dip_litres"
            step="0.001"
            defaultValue={delivery.tanker_dip_litres ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('common.date')} required>
          <Input
            name="delivery_date"
            type="date"
            required
            defaultValue={delivery.delivery_date}
          />
        </Field>
        <Field label={t('stock.received')} required>
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
        <Field label={t('stock.seal')}>
          <Input
            name="seal_number"
            className="uppercase tabular"
            defaultValue={delivery.seal_number ?? ''}
          />
        </Field>
      </div>

      {canSeeCost ? (
        <div className="rounded-lg border border-accent/30 bg-accent-100 p-4">
          <div className="mb-3 text-sm font-semibold text-accent">
            {t('stock.fromInvoice')} — {t('stock.basicHint')}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('stock.supplier')}>
              <Input name="supplier" defaultValue={cost?.supplier ?? ''} />
            </Field>
            <Field label={t('stock.quantityKl')}>
              <NumberInput
                name="quantity_kl"
                step="0.001"
                defaultValue={cost?.quantity_kl ?? ''}
              />
            </Field>
            <Field label={t('stock.ratePerKl')}>
              <NumberInput
                name="rate_per_kl"
                step="0.001"
                defaultValue={cost?.rate_per_kl ?? ''}
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label={t('stock.basic')}>
              <NumberInput
                name="basic"
                step="0.01"
                defaultValue={cost?.basic_amount ?? ''}
              />
            </Field>
            <Field label={t('stock.deliveryCharge')}>
              <NumberInput
                name="delivery_charge"
                step="0.01"
                defaultValue={cost?.delivery_charge ?? ''}
              />
            </Field>
            <Field label={t('stock.vatRate')} hint={t('stock.vatHint')}>
              <NumberInput
                name="vat_rate"
                step="0.001"
                defaultValue={cost?.vat_rate ?? ''}
              />
            </Field>
            <Field label={t('stock.cessRate')} hint={t('stock.cessHint')}>
              <NumberInput
                name="cess_rate"
                step="0.001"
                defaultValue={cost?.cess_rate ?? ''}
              />
            </Field>
          </div>
          {cost?.amount ? (
            <p className="mt-3 text-[13px] text-accent-800">
              {t('stock.lineTotal')}{' '}
              <strong className="tabular">{money(cost.amount)}</strong>
            </p>
          ) : null}
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
