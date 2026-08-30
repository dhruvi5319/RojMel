'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Save, TriangleAlert } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { litres as fmtLitres, money } from '@/lib/format'
import type {
  NozzleReading, NozzleState, Shift, ShiftCollection, Staff,
} from '@/lib/database.types'
import {
  Alert, Badge, Button, Card, CardHeader, Field, NumberInput, Select, Stat,
} from '@/components/ui'
import { saveShift, setShiftStatus, type CollectionInput, type ReadingInput } from '../actions'

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

interface Handover {
  staff_id: string
  name: string
  cash: string
  upi: string
  card: string
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
}: {
  shift: Shift
  nozzles: NozzleState[]
  readings: NozzleReading[]
  staff: Staff[]
  collections: ShiftCollection[]
  creditTotal: number
  locked: boolean
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

  const [handover, setHandover] = useState<Handover[]>(() =>
    staff.map((s) => {
      const existing = collections.find((c) => c.staff_id === s.id)
      return {
        staff_id: s.id,
        name: s.name,
        cash: existing ? String(existing.cash_amount) : '',
        upi: existing ? String(existing.upi_amount) : '',
        card: existing ? String(existing.card_amount) : '',
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
    const collected = handover.reduce(
      (sum, h) => sum + n(h.cash) + n(h.upi) + n(h.card),
      0,
    )
    const expected = amount - creditTotal
    return { litres, amount, collected, expected, diff: expected - collected }
  }, [rows, handover, creditTotal])

  function setRow(i: number, patch: Partial<Row>) {
    setSaved(false)
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
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
      upi_amount: n(h.upi),
      card_amount: n(h.card),
    }))

    startTransition(async () => {
      const result = await saveShift(shift.id, cleaned, payloadCollections)
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
      <Card>
        <CardHeader title={t('shift.readings')} subtitle={t('shift.testHint')} />
        <div className="flex flex-col divide-y divide-border">
          {rows.map((r, i) => {
            const l = r.closing.trim() === '' ? 0 : n(r.closing) - n(r.opening) - n(r.test)
            const invalid = r.closing.trim() !== '' && l < 0
            return (
              <div key={r.nozzle_id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{r.name}</span>
                    <Badge tone="brand">{r.fuel_name}</Badge>
                  </div>
                  <div className="tabular text-right">
                    <div className="font-semibold">{fmtLitres(Math.max(0, l))}</div>
                    <div className="text-sm text-muted">
                      {money(Math.max(0, l) * n(r.rate))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                  <Field label={t('common.rate')}>
                    <NumberInput
                      step="0.001"
                      value={r.rate}
                      disabled={locked}
                      onChange={(e) => setRow(i, { rate: e.target.value })}
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

      {/* ------------------------------------------------------ handover -- */}
      <Card>
        <CardHeader
          title={t('shift.collections')}
          subtitle={`${t('dash.cashExpected')}: ${money(totals.expected)}`}
        />
        {staff.length === 0 ? (
          <div className="p-4 text-muted">{t('common.none')}</div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {handover.map((h, i) => (
              <div key={h.staff_id} className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
                <div className="col-span-3 flex items-center font-medium sm:col-span-1">
                  {h.name}
                </div>
                <Field label={t('mode.cash')}>
                  <NumberInput
                    step="0.01"
                    value={h.cash}
                    disabled={locked}
                    onChange={(e) => setHand(i, { cash: e.target.value })}
                  />
                </Field>
                <Field label={t('mode.upi')}>
                  <NumberInput
                    step="0.01"
                    value={h.upi}
                    disabled={locked}
                    onChange={(e) => setHand(i, { upi: e.target.value })}
                  />
                </Field>
                <Field label={t('mode.card')}>
                  <NumberInput
                    step="0.01"
                    value={h.card}
                    disabled={locked}
                    onChange={(e) => setHand(i, { card: e.target.value })}
                  />
                </Field>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- totals -- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('common.litres')} value={fmtLitres(totals.litres)} />
        <Stat label={t('day.meterSales')} value={money(totals.amount)} tone="brand" />
        <Stat
          label={t('dash.creditGiven')}
          value={money(creditTotal)}
          hint={t('nav.credit')}
        />
        <Stat
          label={t('shift.collections')}
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
        <div className="no-print sticky bottom-0 flex flex-wrap gap-3 border-t border-border bg-background py-3">
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
