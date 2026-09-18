'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import type { LastTax, Shift, Staff, Tank } from '@/lib/database.types'
import { Alert, Field, Input, NumberInput, Select, Textarea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { money as money$ } from '@/lib/format'
import { invoiceLine, type InvoiceLine } from '@/lib/invoice'
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
  lastTax,
}: {
  tanks: Tank[]
  staff: Staff[]
  today: string
  canSeeCost: boolean
  /** what was typed last time for this fuel — a hint, never a default */
  lastTax?: LastTax[]
}) {
  const t = useT()
  const [lines, setLines] = useState<number[]>([0])
  const [nextId, setNextId] = useState(1)

  /*
   * The invoice's own figures, kept in state for one reason: to show the owner
   * what this adds up to before he saves it, so he can check it against the
   * paper in his hand. The figures that are stored are worked out again in
   * Postgres — this is a reading glass, not the calculation.
   */
  const [money, setMoney] = useState<Record<number, InvoiceLine>>({})
  const [rounding, setRounding] = useState('')
  const set = (id: number, patch: Partial<InvoiceLine>) =>
    setMoney((m) => ({ ...m, [id]: { ...(m[id] ?? {}), ...patch } }))

  const add = () => {
    setLines((l) => [...l, nextId])
    setNextId((i) => i + 1)
  }
  const drop = (id: number) => {
    setLines((l) => (l.length === 1 ? l : l.filter((x) => x !== id)))
    setMoney((m) => {
      const rest = { ...m }
      delete rest[id]
      return rest
    })
  }

  const total =
    lines.reduce((sum, id) => sum + invoiceLine(money[id]).amount, 0) +
    (rounding.trim() === '' ? 0 : Number(rounding))

  // Rates move, and VAT differs by product on the same invoice, so nothing is
  // filled in — but saying what it was last time saves hunting for an old
  // challan. A rate that fills itself in is a rate nobody checks.
  const [chosen, setChosen] = useState<Record<number, string>>({})
  const lastFor = (id: number) => {
    const tank = tanks.find((tk) => tk.id === chosen[id])
    return lastTax?.find((x) => x.fuel_type_id === tank?.fuel_type_id)
  }

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

      {/* ------------------------------------------- off the invoice -- */}
      {canSeeCost ? (
        <div className="rounded-lg border border-accent/30 bg-accent-100 p-4">
          <div className="mb-1 text-sm font-semibold text-accent">
            {t('stock.fromInvoice')}
          </div>
          <p className="mb-3 max-w-prose text-[12.5px] text-accent-800">
            {t('stock.fromInvoiceHint')} {t('stock.ratesVary')}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('stock.supplier')}>
              <Input name="supplier" defaultValue="BPCL" />
            </Field>
            <Field label={t('stock.invoiceNo')}>
              <Input name="invoice_number" className="tabular" />
            </Field>
            <Field label={t('stock.invoiceAt')}>
              <Input name="invoice_at" type="datetime-local" />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label={t('stock.shipmentDoc')}>
              <Input name="shipment_doc_no" className="tabular" />
            </Field>
            <Field label={t('stock.deliveryNote')}>
              <Input name="delivery_note_no" className="tabular" />
            </Field>
            <Field label={t('stock.bayNo')}>
              <Input name="bay_no" className="tabular" />
            </Field>
            <Field label={t('stock.transporterCode')}>
              <Input name="transporter_code" className="tabular" />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={t('stock.gateIn')} hint={t('common.optional')}>
              <Input name="gate_in_at" type="datetime-local" />
            </Field>
            <Field label={t('stock.gateOut')} hint={t('common.optional')}>
              <Input name="gate_out_at" type="datetime-local" />
            </Field>
            <Field label={t('stock.roundingOff')} hint={t('common.optional')}>
              <NumberInput
                name="rounding_off"
                step="0.01"
                value={rounding}
                onChange={(e) => setRounding(e.target.value)}
              />
            </Field>
          </div>
        </div>
      ) : (
        <Alert tone="accent">{t('stock.ownerOnlyCost')}</Alert>
      )}

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
                  <Select
                    name="line_tank_id"
                    required
                    value={chosen[id] ?? tanks[0]?.id ?? ''}
                    onChange={(e) => setChosen((c) => ({ ...c, [id]: e.target.value }))}
                  >
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

              {/* What the depot calls it, which is not what the pump does. */}
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label={t('stock.productName')} hint="EBMS · HSD (BS VI)">
                  <Input name="line_product_name" />
                </Field>
                <Field label={t('stock.productCode')}>
                  <Input name="line_product_code" className="tabular" />
                </Field>
                <Field label={t('stock.batch')}>
                  <Input name="line_batch_number" className="tabular" />
                </Field>
                <Field label={t('stock.densityAt15')}>
                  <NumberInput name="line_density_at_15c" step="0.1" />
                </Field>
              </div>

              {canSeeCost ? (
                <div className="mt-4 rounded-lg bg-accent-100 p-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t('stock.quantityKl')}>
                      <NumberInput
                        name="line_quantity_kl"
                        step="0.001"
                        value={money[id]?.quantity_kl ?? ''}
                        onChange={(e) => set(id, { quantity_kl: e.target.value })}
                      />
                    </Field>
                    <Field label={t('stock.ratePerKl')}>
                      <NumberInput name="line_rate_per_kl" step="0.001" />
                    </Field>
                    <Field label={t('stock.basic')} hint={t('stock.basicHint')}>
                      <NumberInput
                        name="line_basic"
                        step="0.01"
                        value={money[id]?.basic ?? ''}
                        onChange={(e) => set(id, { basic: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Field label={t('stock.deliveryCharge')}>
                      <NumberInput
                        name="line_delivery_charge"
                        step="0.01"
                        value={money[id]?.delivery_charge ?? ''}
                        onChange={(e) => set(id, { delivery_charge: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={t('stock.vatRate')}
                      hint={
                        lastFor(id)?.vat_rate != null
                          ? `${t('stock.lastTime')} ${lastFor(id)!.vat_rate}%`
                          : t('stock.vatHint')
                      }
                    >
                      <NumberInput
                        name="line_vat_rate"
                        step="0.001"
                        value={money[id]?.vat_rate ?? ''}
                        onChange={(e) => set(id, { vat_rate: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={t('stock.cessRate')}
                      hint={
                        lastFor(id)?.cess_rate != null
                          ? `${t('stock.lastTime')} ${lastFor(id)!.cess_rate}%`
                          : t('stock.cessHint')
                      }
                    >
                      <NumberInput
                        name="line_cess_rate"
                        step="0.001"
                        value={money[id]?.cess_rate ?? ''}
                        onChange={(e) => set(id, { cess_rate: e.target.value })}
                      />
                    </Field>
                  </div>

                  {invoiceLine(money[id]).amount > 0 ? (
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                      <span className="text-accent-800">
                        VAT {money$(invoiceLine(money[id]).vat)} · CESS{' '}
                        {money$(invoiceLine(money[id]).cess)}
                      </span>
                      <span className="font-semibold">
                        {t('stock.lineTotal')}{' '}
                        <span className="tabular">
                          {money$(invoiceLine(money[id]).amount)}
                        </span>
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
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

      {canSeeCost && total > 0 ? (
        <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-[22px] bg-neutral-200 px-5 py-4">
          <span className="text-[13px] text-neutral-600">
            {t('stock.checkAgainstPaper')}
          </span>
          <span className="font-semibold">
            {t('stock.invoiceTotal')}{' '}
            <span className="tabular text-[18px]">{money$(total)}</span>
          </span>
        </div>
      ) : null}

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
