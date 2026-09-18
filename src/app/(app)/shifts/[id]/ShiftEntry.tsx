'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Save, TriangleAlert } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { litres as fmtLitres, money } from '@/lib/format'
import type {
  CngReading, CngState, NozzleReading, NozzleState, Shift, ShiftCollection, Staff,
} from '@/lib/database.types'
import {
  Alert, Badge, Button, Card, CardHeader, Field, NumberInput, Select, Stat,
} from '@/components/ui'
import {
  saveShift, setShiftStatus,
  type CngReadingInput, type CollectionInput, type ReadingInput,
} from '../actions'

interface Row {
  nozzle_id: string
  name: string
  fuel_name: string
  opening: string
  closing: string
  test: string
  rate: string
  staff_id: string
}

/** A CNG dispenser row. Same shape as a nozzle, counted in kilograms. */
interface GasRow {
  dispenser_id: string
  name: string
  fuel_name: string
  opening: string
  closing: string
  test: string
  rate: string
  staff_id: string
}

/** A filler hands over notes. UPI, ATM and BPCL settle into the pump's one
 *  account, so they are the shift's business, not this person's. */
interface Handover {
  staff_id: string
  name: string
  cash: string
}

const n = (v: string) => (v.trim() === '' ? 0 : Number(v))

export function ShiftEntry({
  shift,
  nozzles,
  readings,
  staff,
  collections,
  creditTotal,
  locked,
  cngDispensers,
  cngReadings,
}: {
  shift: Shift
  nozzles: NozzleState[]
  readings: NozzleReading[]
  staff: Staff[]
  collections: ShiftCollection[]
  creditTotal: number
  locked: boolean
  cngDispensers: CngState[]
  cngReadings: CngReading[]
}) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [rows, setRows] = useState<Row[]>(() =>
    nozzles.map((nz) => {
      const existing = readings.find((r) => r.nozzle_id === nz.nozzle_id)
      return {
        nozzle_id: nz.nozzle_id,
        name: nz.name,
        fuel_name: nz.fuel_name,
        // A saved reading wins; otherwise the meter starts where it stopped.
        opening: String(existing?.opening_reading ?? nz.last_closing ?? 0),
        closing: existing ? String(existing.closing_reading) : '',
        test: String(existing?.test_litres ?? 0),
        rate: String(existing?.sale_rate ?? nz.sale_rate ?? 0),
        staff_id: existing?.staff_id ?? '',
      }
    }),
  )

  const [gas, setGas] = useState<GasRow[]>(() =>
    cngDispensers.map((d) => {
      const existing = cngReadings.find((r) => r.dispenser_id === d.dispenser_id)
      return {
        dispenser_id: d.dispenser_id,
        name: d.name,
        fuel_name: d.fuel_name,
        opening: String(existing?.opening_reading ?? d.last_closing ?? 0),
        closing: existing ? String(existing.closing_reading) : '',
        test: String(existing?.test_kg ?? 0),
        rate: String(existing?.sale_rate ?? d.sale_rate ?? 0),
        staff_id: existing?.staff_id ?? '',
      }
    }),
  )

  const [handover, setHandover] = useState<Handover[]>(() =>
    staff.map((s) => {
      const existing = collections.find((c) => c.staff_id === s.id)
      return {
        staff_id: s.id,
        name: s.name,
        cash: existing ? String(existing.cash_amount) : '',
      }
    }),
  )

  const totals = useMemo(() => {
    let litres = 0
    let amount = 0
    for (const r of rows) {
      if (r.closing.trim() === '') continue
      const l = n(r.closing) - n(r.opening) - n(r.test)
      if (l <= 0) continue
      litres += l
      amount += l * n(r.rate)
    }
    // Kilograms do not add to litres, but their rupees add to the day.
    let kg = 0
    for (const g of gas) {
      if (g.closing.trim() === '') continue
      const k = n(g.closing) - n(g.opening) - n(g.test)
      if (k <= 0) continue
      kg += k
      amount += k * n(g.rate)
    }
    // Only the notes the fillers handed over; the rest of the shift's money
    // is entered on the money log.
    const collected = handover.reduce((sum, h) => sum + n(h.cash), 0)
    const expected = amount - creditTotal
    return { litres, kg, amount, collected, expected, diff: expected - collected }
  }, [rows, gas, handover, creditTotal])

  function setRow(i: number, patch: Partial<Row>) {
    setSaved(false)
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function setGasRow(i: number, patch: Partial<GasRow>) {
    setSaved(false)
    setGas((prev) => prev.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  }

  function setHand(i: number, patch: Partial<Handover>) {
    setSaved(false)
    setHandover((prev) => prev.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  }

  function save(thenSubmit = false) {
    setError(null)

    const bad = rows.find(
      (r) => r.closing.trim() !== '' && n(r.closing) < n(r.opening),
    )
    if (bad) {
      setError(`${bad.name}: ${t('shift.closing')} < ${t('shift.opening')}`)
      return
    }

    const payloadReadings: ReadingInput[] = rows.map((r) => ({
      nozzle_id: r.nozzle_id,
      staff_id: r.staff_id || null,
      opening_reading: n(r.opening),
      closing_reading: r.closing.trim() === '' ? 0 : n(r.closing),
      test_litres: n(r.test),
      sale_rate: n(r.rate),
    }))

    // A nozzle with no closing reading was not worked this shift.
    const cleaned = payloadReadings.map((r) =>
      r.closing_reading === 0 ? { ...r, opening_reading: 0 } : r,
    )

    const payloadCollections: CollectionInput[] = handover.map((h) => ({
      staff_id: h.staff_id,
      cash_amount: n(h.cash),
    }))

    const payloadCng: CngReadingInput[] = gas.map((g) => ({
      dispenser_id: g.dispenser_id,
      staff_id: g.staff_id || null,
      opening_reading: n(g.opening),
      closing_reading: g.closing.trim() === '' ? 0 : n(g.closing),
      test_kg: n(g.test),
      sale_rate: n(g.rate),
    }))
    const cleanedCng = payloadCng.map((c) =>
      c.closing_reading === 0 ? { ...c, opening_reading: 0 } : c,
    )

    startTransition(async () => {
      const result = await saveShift(shift.id, cleaned, payloadCollections, cleanedCng)
      if (result.error) {
        setError(result.error)
        return
      }
      if (thenSubmit) {
        const s = await setShiftStatus(shift.id, 'submitted')
        if (s.error) {
          setError(s.error)
          return
        }
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------ readings -- */}
      <Card role="group" aria-label="Nozzle readings">
        <CardHeader
          title={t('shift.readings')}
          subtitle={t('shift.testHint')}
          action={
            <Link
              href="/#rates"
              className="text-[12.5px] font-semibold whitespace-nowrap text-accent hover:underline"
            >
              {t('rate.today')} →
            </Link>
          }
        />
        <div className="flex flex-col divide-y divide-divider">
          {rows.map((r, i) => {
            const l = r.closing.trim() === '' ? 0 : n(r.closing) - n(r.opening) - n(r.test)
            const invalid = r.closing.trim() !== '' && l < 0
            return (
              <div key={r.nozzle_id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{r.name}</span>
                    <Badge tone="accent">{r.fuel_name}</Badge>
                  </div>
                  <div className="tabular text-right">
                    <div className="font-semibold">{fmtLitres(Math.max(0, l))}</div>
                    <div className="text-sm text-neutral-600">
                      {money(Math.max(0, l) * n(r.rate))}
                    </div>
                    <div className="text-[12px] text-neutral-600">
                      {t('rate.usedThisShift')} ₹{n(r.rate).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label={t('shift.opening')}>
                    <NumberInput
                      step="0.001"
                      value={r.opening}
                      disabled={locked}
                      onChange={(e) => setRow(i, { opening: e.target.value })}
                    />
                  </Field>
                  <Field label={t('shift.closing')} error={invalid ? t('common.error') : null}>
                    <NumberInput
                      step="0.001"
                      value={r.closing}
                      disabled={locked}
                      onChange={(e) => setRow(i, { closing: e.target.value })}
                    />
                  </Field>
                  <Field label={t('shift.testing')}>
                    <NumberInput
                      step="0.001"
                      value={r.test}
                      disabled={locked}
                      onChange={(e) => setRow(i, { test: e.target.value })}
                    />
                  </Field>
                  <Field label={t('shift.filler')}>
                    <Select
                      value={r.staff_id}
                      disabled={locked}
                      onChange={(e) => setRow(i, { staff_id: e.target.value })}
                    >
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
            )
          })}
        </div>
      </Card>

      {/* ----------------------------------------------------------- CNG -- */}
      {gas.length > 0 ? (
        <Card role="group" aria-label="CNG readings">
          <CardHeader
            title={`${t('shift.readings')} — CNG`}
            subtitle={t('cng.kgHint')}
          />
          <div className="flex flex-col divide-y divide-divider">
            {gas.map((g, i) => {
              const k =
                g.closing.trim() === '' ? 0 : n(g.closing) - n(g.opening) - n(g.test)
              return (
                <div key={g.dispenser_id} className="p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{g.name}</span>
                      <Badge tone="ok">{g.fuel_name}</Badge>
                    </div>
                    <div className="tabular text-right">
                      <div className="font-semibold">
                        {Math.max(0, k).toFixed(2)} kg
                      </div>
                      <div className="text-sm text-neutral-600">
                        {money(Math.max(0, k) * n(g.rate))}
                      </div>
                      <div className="text-[12px] text-neutral-600">
                        {t('rate.usedThisShift')} ₹{n(g.rate).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label={t('shift.opening')}>
                      <NumberInput
                        step="0.001"
                        value={g.opening}
                        disabled={locked}
                        onChange={(e) => setGasRow(i, { opening: e.target.value })}
                      />
                    </Field>
                    <Field label={t('shift.closing')}>
                      <NumberInput
                        step="0.001"
                        value={g.closing}
                        disabled={locked}
                        onChange={(e) => setGasRow(i, { closing: e.target.value })}
                      />
                    </Field>
                    <Field label={t('cng.testKg')}>
                      <NumberInput
                        step="0.001"
                        value={g.test}
                        disabled={locked}
                        onChange={(e) => setGasRow(i, { test: e.target.value })}
                      />
                    </Field>
  
                    <Field label={t('shift.filler')}>
                      <Select
                        value={g.staff_id}
                        disabled={locked}
                        onChange={(e) => setGasRow(i, { staff_id: e.target.value })}
                      >
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
              )
            })}
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------ handover -- */}
      <Card role="group" aria-label="Handover">
        <CardHeader
          title={t('shift.cashFromFillers')}
          subtitle={t('shift.cashOnlyHint')}
          action={
            <Link
              href={`/moneylog?date=${shift.business_date}`}
              className="text-[12.5px] font-semibold whitespace-nowrap text-accent hover:underline"
            >
              {t('nav.money')} →
            </Link>
          }
        />
        {staff.length === 0 ? (
          <div className="p-4 text-neutral-600">{t('common.none')}</div>
        ) : (
          <div className="flex flex-col divide-y divide-divider">
            {handover.map((h, i) => (
              <div
                key={h.staff_id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="font-semibold">{h.name}</span>
                <div className="w-40">
                  <NumberInput
                    step="0.01"
                    value={h.cash}
                    disabled={locked}
                    aria-label={`${t('mode.cash')} — ${h.name}`}
                    placeholder="0.00"
                    onChange={(e) => setHand(i, { cash: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- totals -- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('common.quantity')}
          value={fmtLitres(totals.litres)}
          hint={totals.kg > 0 ? `${totals.kg.toFixed(2)} kg CNG` : undefined}
        />
        <Stat label={t('day.meterSales')} value={money(totals.amount)} tone="accent" />
        <Stat
          label={t('dash.creditGiven')}
          value={money(creditTotal)}
          hint={t('nav.credit')}
        />
        <Stat
          label={t('shift.cashFromFillers')}
          value={money(totals.collected)}
          hint={
            Math.abs(totals.diff) < 0.5
              ? t('dash.allSquare')
              : `${totals.diff > 0 ? t('dash.collectionShort') : t('dash.collectionOver')}: ${money(Math.abs(totals.diff))}`
          }
          tone={Math.abs(totals.diff) < 0.5 ? 'ok' : totals.diff > 0 ? 'danger' : 'accent'}
        />
      </div>

      {error ? (
        <Alert tone="danger">
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="size-4" aria-hidden />
            {error}
          </span>
        </Alert>
      ) : null}

      {saved ? (
        <Alert tone="ok">
          <span className="inline-flex items-center gap-2">
            <Check className="size-4" aria-hidden />
            {t('counter.done')}
          </span>
        </Alert>
      ) : null}

      {!locked ? (
        <div className="no-print sticky bottom-0 flex flex-wrap gap-3 border-t border-divider bg-bg py-3">
          <Button type="button" size="lg" disabled={pending} onClick={() => save(false)}>
            <Save className="size-4" aria-hidden />
            {pending ? t('common.saving') : t('common.save')}
          </Button>
          {shift.status === 'open' ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={pending}
              onClick={() => save(true)}
            >
              {t('shift.close')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
