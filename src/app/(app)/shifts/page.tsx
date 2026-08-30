import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong, litres, money, todayIST } from '@/lib/format'
import type { Shift } from '@/lib/database.types'
import { Badge, Card, CardHeader, Empty, PageHeader, Td, TableWrap, Th } from '@/components/ui'
import { DateNav } from '@/components/DateNav'
import { OpenShiftForm } from './OpenShiftForm'

export const dynamic = 'force-dynamic'

interface ShiftRow extends Shift {
  nozzle_readings: { litres: number; amount: number }[]
  shift_collections: { cash_amount: number; upi_amount: number; card_amount: number }[]
}

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const date = (await searchParams).date || todayIST()

  const [{ data: shifts }, { data: existing }] = await Promise.all([
    supabase
      .from('shifts')
      .select(
        'id, station_id, business_date, name, sort_order, status, opened_at, closed_at, created_by, approved_by, approved_at, notes, ' +
          'nozzle_readings(litres, amount), shift_collections(cash_amount, upi_amount, card_amount)',
      )
      .eq('business_date', date)
      .order('sort_order'),
    supabase.from('shifts').select('name').eq('business_date', date),
  ])

  const rows = (shifts ?? []) as unknown as ShiftRow[]
  const taken = new Set((existing ?? []).map((s) => s.name))

  const statusTone = {
    open: 'accent',
    submitted: 'brand',
    approved: 'ok',
  } as const

  return (
    <>
      <PageHeader
        title={t('shift.title')}
        subtitle={formatDateLong(date)}
        action={<DateNav date={date} />}
      />

      <Card>
        <CardHeader title={t('shift.title')} />
        {rows.length === 0 ? (
          <Empty>{t('shift.noneToday')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('shift.name')}</Th>
                <Th>{t('common.status')}</Th>
                <Th className="text-right">{t('common.litres')}</Th>
                <Th className="text-right">{t('day.meterSales')}</Th>
                <Th className="text-right">{t('shift.collections')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const l = s.nozzle_readings.reduce((a, r) => a + Number(r.litres), 0)
                const amt = s.nozzle_readings.reduce((a, r) => a + Number(r.amount), 0)
                const coll = s.shift_collections.reduce(
                  (a, c) =>
                    a + Number(c.cash_amount) + Number(c.upi_amount) + Number(c.card_amount),
                  0,
                )
                return (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td>
                      <Badge tone={statusTone[s.status]}>{t(`shift.${s.status}`)}</Badge>
                    </Td>
                    <Td className="tabular text-right">{litres(l)}</Td>
                    <Td className="tabular text-right font-semibold">{money(amt)}</Td>
                    <Td className="tabular text-right">{money(coll)}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/shifts/${s.id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                      >
                        {t('shift.readings')}
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <div className="mt-4">
        <OpenShiftForm date={date} taken={[...taken]} />
      </div>
    </>
  )
}
