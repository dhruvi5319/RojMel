import { notFound } from 'next/navigation'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong } from '@/lib/format'
import { shiftLabel } from '@/lib/shifts'
import type {
  CngReading, CngState, NozzleReading, NozzleState, Shift, ShiftCollection,
  ShiftFiller, Staff,
} from '@/lib/database.types'
import { Alert, Card, CardHeader, LinkButton, PageHeader, TableWrap, Td, Th } from '@/components/ui'
import { Editable } from '@/components/Editable'
import { litres as fmtLitres, money } from '@/lib/format'
import { ShiftEntry } from './ShiftEntry'
import { ShiftStatusBar } from './ShiftStatusBar'

export const dynamic = 'force-dynamic'

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireBackOffice()
  const { id } = await params
  const t = await getT()
  const supabase = await createClient()

  const { data: shift } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', id)
    .maybeSingle<Shift>()

  if (!shift) notFound()

  const [
    nozzlesRes, readingsRes, staffRes, collectionsRes, closingRes, creditRes,
    cngStateRes, cngReadingsRes, fillersRes,
  ] = await Promise.all([
      supabase.from('v_nozzle_state').select('*').order('sort_order'),
      supabase.from('nozzle_readings').select('*').eq('shift_id', id),
      supabase.from('staff').select('*').eq('is_active', true).order('name'),
      supabase.from('shift_collections').select('*').eq('shift_id', id),
      supabase
        .from('day_closings')
        .select('status')
        .eq('business_date', shift.business_date)
        .maybeSingle<{ status: string }>(),
      // Credit slips are part of the meter total, so the handover expected
      // from the fillers is meter sales minus whatever went out on udhaar.
      supabase.from('credit_sales').select('amount').eq('shift_id', id),
      supabase.from('v_cng_state').select('*').order('sort_order'),
      supabase.from('cng_readings').select('*').eq('shift_id', id),
      // Who the forecourt said was standing here. The cash boxes below belong
      // to them and not to the whole payroll — a name that was never on this
      // shift is a name record_shift_cash() refuses on the counter.
      supabase.from('v_shift_fillers').select('*').eq('shift_id', id).order('name'),
    ])

  const creditTotal = (creditRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as { amount: number }).amount),
    0,
  )

  const locked =
    shift.status === 'approved' || closingRes.data?.status === 'approved'

  // Who in the office agreed it, for the line that says so.
  const { data: agreed } = shift.approved_by
    ? await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', shift.approved_by)
        .maybeSingle<{ full_name: string }>()
    : { data: null }
  const approvedByName = agreed?.full_name ?? null

  // The two names the counter now records against a shift.
  const crew = (staffRes.data ?? []) as Staff[]
  const staffName = (id: string | null) => crew.find((p) => p.id === id)?.name ?? null

  return (
    <>
      <PageHeader
        title={`${shiftLabel(t, shift.name)} — ${t('shift.readings')}`}
        subtitle={formatDateLong(shift.business_date)}
        action={
          <LinkButton
            href={`/shifts?date=${shift.business_date}`}
            variant="secondary"
            size="sm"
          >
            {t('common.back')}
          </LinkButton>
        }
      />

      <ShiftStatusBar
        shift={shift}
        approvedByName={approvedByName}
        openedByName={staffName(shift.opened_by_staff)}
        closedByName={staffName(shift.closed_by_staff)}
      />

      {closingRes.data?.status === 'approved' ? (
        <div className="mb-4">
          <Alert tone="accent">{t('day.locked')}</Alert>
        </div>
      ) : null}

      {/* A shift is read far more often than it is corrected — the office
          comes here to check the forecourt's figures, not to retype them — so
          what was recorded is shown plainly, behind one pencil. */}
      <Card>
        <CardHeader title={t('shift.readings')} subtitle={t('shift.recordedHint')} />
        <div className="p-5">
          <Editable
            label={t('shift.readings')}
            locked={locked ? t('day.locked') : undefined}
            form={
              <ShiftEntry
                shift={shift}
                locked={locked}
                nozzles={(nozzlesRes.data ?? []) as NozzleState[]}
                readings={(readingsRes.data ?? []) as NozzleReading[]}
                staff={(staffRes.data ?? []) as Staff[]}
                fillers={(fillersRes.data ?? []) as ShiftFiller[]}
                collections={(collectionsRes.data ?? []) as ShiftCollection[]}
                creditTotal={creditTotal}
                cngDispensers={(cngStateRes.data ?? []) as CngState[]}
                cngReadings={(cngReadingsRes.data ?? []) as CngReading[]}
              />
            }
            view={
              <RecordedShift
                nozzles={(nozzlesRes.data ?? []) as NozzleState[]}
                readings={(readingsRes.data ?? []) as NozzleReading[]}
                cngDispensers={(cngStateRes.data ?? []) as CngState[]}
                cngReadings={(cngReadingsRes.data ?? []) as CngReading[]}
                collections={(collectionsRes.data ?? []) as ShiftCollection[]}
                fillers={(fillersRes.data ?? []) as ShiftFiller[]}
                creditTotal={creditTotal}
                t={t}
              />
            }
          />
        </div>
      </Card>
    </>
  )
}

/** What the forecourt recorded, as a page to read rather than a page to fill. */
function RecordedShift({
  nozzles,
  readings,
  cngDispensers,
  cngReadings,
  collections,
  fillers,
  creditTotal,
  t,
}: {
  nozzles: NozzleState[]
  readings: NozzleReading[]
  cngDispensers: CngState[]
  cngReadings: CngReading[]
  collections: ShiftCollection[]
  fillers: ShiftFiller[]
  creditTotal: number
  t: Awaited<ReturnType<typeof getT>>
}) {
  const meters = [
    ...nozzles.map((n) => ({
      id: n.nozzle_id,
      name: n.name,
      fuel: n.fuel_name,
      unit: 'L' as const,
      row: readings.find((r) => r.nozzle_id === n.nozzle_id),
    })),
    ...cngDispensers.map((d) => ({
      id: d.dispenser_id,
      name: d.name,
      fuel: d.fuel_name,
      unit: 'kg' as const,
      row: cngReadings.find((r) => r.dispenser_id === d.dispenser_id),
    })),
  ]
  const sold = meters.reduce((a, m) => a + Number(m.row?.amount ?? 0), 0)
  const cash = collections.reduce((a, c) => a + Number(c.cash_amount), 0)
  const nameOf = (id: string | null) =>
    fillers.find((f) => f.staff_id === id)?.name ?? null

  return (
    <div className="flex flex-col gap-4">
      <TableWrap>
        <thead>
          <tr>
            <Th>{t('set.nozzles')}</Th>
            <Th className="text-right">{t('money.opening')}</Th>
            <Th className="text-right">{t('money.closing')}</Th>
            <Th className="text-right">{t('common.quantity')}</Th>
            <Th className="text-right">{t('common.amount')}</Th>
          </tr>
        </thead>
        <tbody>
          {meters.map((m) => (
            <tr key={m.id}>
              <Td>
                <span className="font-medium">{m.name}</span>
                <div className="text-[12.5px] text-neutral-700">{m.fuel}</div>
              </Td>
              <Td className="tabular text-right text-neutral-700">
                {m.row ? Number(m.row.opening_reading).toFixed(2) : '—'}
              </Td>
              <Td className="tabular text-right text-neutral-700">
                {m.row ? Number(m.row.closing_reading).toFixed(2) : '—'}
              </Td>
              <Td className="tabular text-right">
                {m.row
                  ? m.unit === 'kg'
                    ? `${Number((m.row as CngReading).kg).toFixed(2)} kg`
                    : fmtLitres(Number((m.row as NozzleReading).litres))
                  : '—'}
              </Td>
              <Td className="tabular text-right font-semibold">
                {m.row ? money(m.row.amount) : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className="text-[11.5px] text-neutral-700">{t('day.meterSales')}</dt>
          <dd className="tabular text-[19px] font-bold">{money(sold)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-neutral-700">{t('credit.title')}</dt>
          <dd className="tabular text-[19px] font-bold">{money(creditTotal)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-neutral-700">{t('shift.cashHandedOver')}</dt>
          <dd className="tabular text-[19px] font-bold">{money(cash)}</dd>
        </div>
      </dl>

      {collections.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {collections.map((c) => (
            <span
              key={c.id}
              className="tabular rounded-full bg-neutral-100 px-3 py-1.5 text-[13px]"
            >
              {nameOf(c.staff_id) ?? t('money.notNamed')} · {money(c.cash_amount)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
