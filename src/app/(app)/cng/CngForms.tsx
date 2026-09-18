'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import { invoiceLine } from '@/lib/invoice'
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
  lastVat,
  lastCess,
}: {
  today: string
  canSeeCost: boolean
  staff: Staff[]
  supply?: CngSupply
  cost?: CngSupplyCost | null
  /** what was typed last time, as a hint — never as a default */
  lastVat?: number | null
  lastCess?: number | null
}) {
  const t = useT()
  const editing = Boolean(supply)

  // Held in state only so the owner can see what it comes to before saving.
  // Postgres works out what is stored.
  const [v, setV] = useState({
    basic: String(cost?.basic_amount ?? ''),
    delivery_charge: String(cost?.delivery_charge ?? ''),
    vat_rate: String(cost?.vat_rate ?? ''),
    cess_rate: String(cost?.cess_rate ?? ''),
  })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }))
  const total = invoiceLine(v)

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
          <div className="mb-1 text-[12.5px] font-semibold text-accent-800">
            {t('stock.fromInvoice')} — {t('cng.gasCost')}
          </div>
          <p className="mb-3 max-w-prose text-[12px] text-accent-800">
            {t('stock.fromInvoiceHint')}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
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
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label={t('stock.basic')} hint={t('stock.basicHint')}>
              <NumberInput
                name="basic"
                step="0.01"
                value={v.basic}
                onChange={set('basic')}
              />
            </Field>
            <Field label={t('stock.deliveryCharge')}>
              <NumberInput
                name="delivery_charge"
                step="0.01"
                value={v.delivery_charge}
                onChange={set('delivery_charge')}
              />
            </Field>
            <Field
              label={t('stock.vatRate')}
              hint={lastVat != null ? `${t('stock.lastTime')} ${lastVat}%` : t('stock.vatHint')}
            >
              <NumberInput
                name="vat_rate"
                step="0.001"
                value={v.vat_rate}
                onChange={set('vat_rate')}
              />
            </Field>
            <Field
              label={t('stock.cessRate')}
              hint={lastCess != null ? `${t('stock.lastTime')} ${lastCess}%` : t('stock.cessHint')}
            >
              <NumberInput
                name="cess_rate"
                step="0.001"
                value={v.cess_rate}
                onChange={set('cess_rate')}
              />
            </Field>
          </div>
          {total.amount > 0 ? (
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
              <span className="text-accent-800">
                VAT {money(total.vat)} · CESS {money(total.cess)}
              </span>
              <span className="font-semibold">
                {t('stock.invoiceTotal')}{' '}
                <span className="tabular">{money(total.amount)}</span>
              </span>
            </div>
          ) : null}
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
