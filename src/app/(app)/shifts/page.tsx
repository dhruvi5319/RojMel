import Link from 'next/link'
import { ArrowRight, Check, TriangleAlert } from 'lucide-react'
import { requireBackOffice, pumpToday } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getLang, getT } from '@/lib/i18n/server'
import { formatDateLong, formatTime, litres, money } from '@/lib/format'
import { shiftLabel } from '@/lib/shifts'
import type { Shift, ShiftFiller, ShiftMoney, Staff } from '@/lib/database.types'
import { Badge, Card, Empty, PageHeader } from '@/components/ui'
import { OpenShiftForm } from './OpenShiftForm'

export const dynamic = 'force-dynamic'

interface ShiftRow extends Shift {
  nozzle_readings: { litres: number; amount: number }[]
  cng_readings: { kg: number; amount: number }[]
  shift_collections: { cash_amount: number }[]
}

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireBackOffice()
  const t = await getT()
  const lang = await getLang()
  const supabase = await createClient()
  const date = (await searchParams).date || pumpToday(session)

  const [{ data: shifts }, { data: money_ }, { data: fillers }, { data: staff }] =
    await Promise.all([
      supabase
        .from('shifts')
        .select(
          'id, station_id, business_date, name, sort_order, status, opened_at, closed_at, ' +
            'opened_by_staff, closed_by_staff, created_by, approved_by, approved_at, notes, ' +
            'nozzle_readings(litres, amount), cng_readings(kg, amount), ' +
            'shift_collections(cash_amount)',
        )
        .eq('business_date', date)
        .order('sort_order'),
      // What the meters say against how the money arrived, which is the only
      // thing that makes a shift right or wrong.
      supabase.from('v_shift_money').select('*').eq('business_date', date),
      // Who the forecourt said was standing there. The office never saw this.
      supabase.from('v_shift_fillers').select('*').order('name'),
      supabase.from('staff').select('id, name, name_gu'),
    ])

  const rows = (shifts ?? []) as unknown as ShiftRow[]
  const balances = (money_ ?? []) as ShiftMoney[]
  const everyFiller = (fillers ?? []) as ShiftFiller[]
  const people = (staff ?? []) as Pick<Staff, 'id' | 'name' | 'name_gu'>[]
  const taken = new Set(rows.map((s) => s.name))

  const nameOf = (s: { name: string; name_gu?: string | null } | undefined) =>
    s ? (lang === 'gu' && s.name_gu) || s.name : null
  const whoIs = (id: string | null) => nameOf(people.find((p) => p.id === id))

  const day = rows.reduce(
    (a, s) => ({
      litres: a.litres + s.nozzle_readings.reduce((n, r) => n + Number(r.litres), 0),
      kg: a.kg + s.cng_readings.reduce((n, r) => n + Number(r.kg), 0),
      sold:
        a.sold +
        s.nozzle_readings.reduce((n, r) => n + Number(r.amount), 0) +
        s.cng_readings.reduce((n, r) => n + Number(r.amount), 0),
      cash: a.cash + s.shift_collections.reduce((n, c) => n + Number(c.cash_amount), 0),
    }),
    { litres: 0, kg: 0, sold: 0, cash: 0 },
  )
  const difference = balances.reduce((a, b) => a + Number(b.difference), 0)
  const onToday = new Set(
    everyFiller.filter((f) => rows.some((s) => s.id === f.shift_id)).map((f) => f.staff_id),
  )

  return (
    <>
      <PageHeader title={t('shift.title')} subtitle={formatDateLong(date)} />
      <p className="mb-5 max-w-2xl text-[13px] text-neutral-700">{t('shift.officeReads')}</p>

      {rows.length === 0 ? (
        <Card>
          <Empty>{t('shift.noneToday')}</Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((s) => {
            const balance = balances.find((b) => b.shift_id === s.id)
            const diff = Number(balance?.difference ?? 0)
            const square = Math.abs(diff) < 0.5
            const litresSold = s.nozzle_readings.reduce((a, r) => a + Number(r.litres), 0)
            const kgSold = s.cng_readings.reduce((a, r) => a + Number(r.kg), 0)
            const sold =
              s.nozzle_readings.reduce((a, r) => a + Number(r.amount), 0) +
              s.cng_readings.reduce((a, r) => a + Number(r.amount), 0)
            const cash = s.shift_collections.reduce((a, c) => a + Number(c.cash_amount), 0)
            const mine = everyFiller.filter((f) => f.shift_id === s.id)
            const openedBy = whoIs(s.opened_by_staff)
            const closedBy = whoIs(s.closed_by_staff)

            return (
              <div
                key={s.id}
                className={`rounded-[var(--radius-card)] bg-surface px-5 pt-4 pb-5 ${
                  square ? '' : 'border-2 border-danger-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[21px]">{shiftLabel(t, s.name)}</h2>

                  {/* Right or wrong comes first: a shift that does not tally is
                      the only reason to open one of these. */}
                  {sold > 0 ? (
                    square ? (
                      <Badge tone="ok">
                        <Check className="size-3.5" aria-hidden /> {t('money.balances')}
                      </Badge>
                    ) : (
                      <Badge tone="danger">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        <span className="tabular">
                          {money(Math.abs(diff))}{' '}
                          {diff > 0 ? t('dash.collectionShort') : t('dash.collectionOver')}
                        </span>
                      </Badge>
                    )
                  ) : null}

                  <Badge tone={s.status === 'approved' ? 'ok' : 'accent'}>
                    {t(`shift.${s.status}`)}
                  </Badge>

                  <Link
                    href={`/shifts/${s.id}`}
                    className="ml-auto inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent hover:underline"
                  >
                    {t('shift.readings')}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                  <Figure label={t('day.meterSales')} value={money(sold)} />
                  <Figure
                    label={t('common.litres')}
                    value={`${litres(litresSold)}${kgSold > 0 ? ` · ${kgSold.toFixed(2)} kg` : ''}`}
                  />
                  <Figure label={t('credit.title')} value={money(Number(balance?.udhaar ?? 0))} />
                  <Figure label={t('shift.cashHandedOver')} value={money(cash)} />
                </dl>

                {/* Who the forecourt said was standing there, and who pressed
                    the two buttons that begin and end a shift. Recorded by the
                    counter since it started keeping them, and shown nowhere
                    until now. */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-divider pt-3.5">
                  <span className="text-[12.5px] text-neutral-700">{t('shift.workedBy')}</span>
                  {mine.length === 0 ? (
                    <span className="text-[13px] text-neutral-700">
                      {t('shift.nobodyOnThisShift')}
                    </span>
                  ) : (
                    mine.map((f) => (
                      <span
                        key={f.staff_id}
                        className="inline-flex items-center gap-2 rounded-full bg-neutral-100 py-1 pr-3 pl-1 text-[13px] font-semibold"
                      >
                        <span
                          aria-hidden
                          className="grid size-[22px] place-items-center rounded-full bg-accent-200 text-[11px] font-bold text-accent-800"
                        >
                          {nameOf(f)?.slice(0, 1)}
                        </span>
                        {nameOf(f)}
                        {f.covering ? (
                          <span className="rounded-full bg-accent-200 px-2 py-0.5 text-[10.5px] font-bold text-accent-800">
                            {t('counter.covering')}
                          </span>
                        ) : null}
                      </span>
                    ))
                  )}
                  <span className="tabular ml-auto text-[12.5px] text-neutral-700">
                    {openedBy
                      ? `${openedBy} ${t('shift.startedIt')} ${formatTime(s.opened_at)}`
                      : `${t('shift.openedByOffice')} ${formatTime(s.opened_at)}`}
                    {s.closed_at
                      ? ` · ${closedBy ? `${closedBy} ` : ''}${t('shift.handedItIn')} ${formatTime(s.closed_at)}`
                      : ''}
                  </span>
                </div>
              </div>
            )
          })}

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[var(--radius-card)] bg-neutral-200 px-5 py-4">
            <span className="text-[12px] font-bold tracking-[0.09em] text-neutral-700 uppercase">
              {t('shift.bothShifts')}
            </span>
            <Figure label={t('day.meterSales')} value={money(day.sold)} />
            <Figure
              label={t('common.litres')}
              value={`${litres(day.litres)}${day.kg > 0 ? ` · ${day.kg.toFixed(2)} kg` : ''}`}
            />
            <Figure label={t('shift.cashHandedOver')} value={money(day.cash)} />
            <Figure label={t('shift.fillersOn')} value={String(onToday.size)} />
            <div className="ml-auto text-right">
              <dt className="text-[11.5px] text-neutral-700">{t('money.difference')}</dt>
              <dd
                className={`tabular text-[19px] font-bold ${
                  Math.abs(difference) < 0.5 ? 'text-accent-2-800' : 'text-danger'
                }`}
              >
                {money(difference)}
              </dd>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        <OpenShiftForm date={date} taken={[...taken]} />
      </div>
    </>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-neutral-700">{label}</dt>
      <dd className="tabular text-[19px] font-bold">{value}</dd>
    </div>
  )
}
