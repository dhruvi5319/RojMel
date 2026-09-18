'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import type { Shift, Staff, Tank } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { recordDelivery, recordDip } from './actions'

/**
 * A delivery is a tanker, and a tanker fills more than one tank.
 *
 * It arrives from the depot with compartments — petrol in some, diesel in
 * others. The pump has no reason to write the compartments down; what it must
 * write down is how much went into each of its own tanks. So the tanker's own
 * facts are asked once at the top, and a line is added per tank below.
 */
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
  const [lines, setLines] = useState<number[]>([0])
  const [nextId, setNextId] = useState(1)

  const add = () => {
    setLines((l) => [...l, nextId])
    setNextId((i) => i + 1)
  }
  const drop = (id: number) => setLines((l) => (l.length === 1 ? l : l.filter((x) => x !== id)))

  return (
    <ActionForm
      action={recordDelivery}
      onDone={t('counter.done')}
      resetOnSuccess
      onSuccess={() => {
        setLines([0])
        setNextId(1)
      }}
    >
      {/* ------------------------------------------------------ the tanker -- */}
      <div>
        <div className="mb-1 text-sm font-semibold">{t('stock.theTanker')}</div>
        <p className="mb-3 text-[12.5px] text-neutral-600">{t('stock.theTankerHint')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('common.date')} required>
            <Input name="delivery_date" type="date" required defaultValue={today} />
          </Field>
          <Field label={t('stock.tanker')}>
            <Input name="tanker_number" className="uppercase tabular" />
          </Field>
          <Field label={t('stock.seal')}>
            <Input name="seal_number" className="uppercase tabular" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-5">
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
          <div className="min-w-48 flex-1">
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
          </div>
        </div>
      </div>

      {/* --------------------------------------------- one line per tank -- */}
      <div>
        <div className="mb-1 text-sm font-semibold">{t('stock.intoTanks')}</div>
        <p className="mb-3 text-[12.5px] text-neutral-600">{t('stock.oneTankerTwoFuels')}</p>

        <div className="flex flex-col gap-4">
          {lines.map((id, i) => (
            <div key={id} className="rounded-lg border border-divider bg-surface-2 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-semibold text-neutral-600">
                  {i + 1}
                </span>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => drop(id)}
                    aria-label={t('stock.removeTank')}
                    className="text-[12.5px] font-semibold text-neutral-600 hover:text-accent"
                  >
                    {t('stock.removeTank')}
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('stock.tank')} required>
                  <Select name="line_tank_id" required>
                    {tanks.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {tk.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('stock.received')} required hint={t('stock.receivedHint')}>
                  <NumberInput name="line_litres" step="0.001" required />
                </Field>
              </div>

              {/* Three quantities, kept apart — a shortage argument turns on them. */}
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label={t('stock.ordered')} hint={t('stock.orderedHint')}>
                  <NumberInput name="line_ordered_litres" step="0.001" />
                </Field>
                <Field label={t('stock.challan')} hint={t('stock.challanHint')}>
                  <NumberInput name="line_invoice_litres" step="0.001" />
                </Field>
                <Field label={t('stock.tankerDip')} hint={t('stock.tankerDipHint')}>
                  <NumberInput name="line_tanker_dip_litres" step="0.001" />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label={t('stock.dipBefore')}>
                  <NumberInput name="line_dip_before_litres" step="0.001" />
                </Field>
                <Field label={t('stock.dipAfter')}>
                  <NumberInput name="line_dip_after_litres" step="0.001" />
                </Field>
                <Field label="Density" hint={t('common.optional')}>
                  <NumberInput name="line_density" step="0.001" />
                </Field>
                <Field label={t('stock.temperature')} hint={t('common.optional')}>
                  <NumberInput name="line_temperature_c" step="0.1" />
                </Field>
              </div>

              {canSeeCost ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label={t('stock.purchaseRate')}>
                    <NumberInput name="line_rate_per_litre" step="0.001" />
                  </Field>
                  <Field label={t('stock.vatRate')} hint={t('stock.vatHint')}>
                    <NumberInput name="line_vat_rate" step="0.001" />
                  </Field>
                </div>
              ) : (
                /* The line count has to match whatever the server reads, and
                   the manager never sends a rate at all. */
                null
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="mt-3 rounded-full border border-accent/40 px-4 py-2 text-[13px] font-semibold text-accent hover:bg-accent-100"
        >
          + {t('stock.addTank')}
        </button>
      </div>

      {canSeeCost ? (
        <div className="rounded-lg border border-accent/30 bg-accent-100 p-4">
          <div className="mb-3 text-sm font-semibold text-accent">
            {t('rep.ownerOnly')} — {t('stock.purchaseRate')}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('stock.supplier')}>
              <Input name="supplier" />
            </Field>
            <Field label={t('inv.number')}>
              <Input name="invoice_number" />
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
