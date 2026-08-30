import Link from 'next/link'
import { CheckCircle2, Lock } from 'lucide-react'
import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong, litres, money, todayIST } from '@/lib/format'
import type { DayClosing, DaySummary } from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'
import { PrintButton } from '@/components/PrintButton'
import { ApproveDayForm, ReopenDayForm, SubmitDayForm } from './DayForms'

export const dynamic = 'force-dynamic'

export default async function DayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireBackOffice()
  const owner = isOwner(session)
  const t = await getT()
  const supabase = await createClient()
  const date = (await searchParams).date || todayIST()

  const [summaryRes, closingRes, recentRes] = await Promise.all([
    supabase.rpc('day_summary', { p_date: date }),
    supabase
      .from('day_closings')
      .select('*, approver:profiles!day_closings_approved_by_fkey(full_name)')
      .eq('business_date', date)
      .maybeSingle(),
    supabase
      .from('day_closings')
      .select('*')
      .order('business_date', { ascending: false })
      .limit(14),
  ])

  const day = (summaryRes.data ?? null) as DaySummary | null
  const closing = closingRes.data as
    | (DayClosing & { approver: { full_name: string } | null })
    | null
  const recent = (recentRes.data ?? []) as DayClosing[]

  const status = day?.status ?? 'draft'
  const approved = status === 'approved'
  const short = day?.collection_short ?? 0
  const cashDiff = (day?.counted_cash ?? 0) - (day?.expected_cash ?? 0)

  const tone = { draft: 'neutral', submitted: 'accent', approved: 'ok' } as const

  return (
    <>
      <PageHeader
        title={t('day.title')}
        subtitle={formatDateLong(date)}
        action={
          <>
            <PrintButton />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={tone[status]}>{t(`shift.${status === 'draft' ? 'open' : status}`)}</Badge>
        {approved && closing?.approver ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
            <CheckCircle2 className="size-4 text-accent-2-700" aria-hidden />
            {t('day.approvedBy')} {closing.approver.full_name}
          </span>
        ) : null}
      </div>

      {/* ------------------------------------------------------ breakdown -- */}
      <Card className="print-plain">
        <CardHeader title={t('day.breakdown')} />
        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
          <Stat
            label={t('day.meterSales')}
            value={money(day?.meter_sales ?? 0)}
            hint={litres(day?.litres_sold ?? 0)}
            tone="accent"
          />
          <Stat label={t('dash.creditGiven')} value={money(day?.credit_sales ?? 0)} />
          <Stat label={t('day.counterSales')} value={money(day?.counter_sales ?? 0)} />
          <Stat
            label={t('shift.collections')}
            value={money(day?.collected_total ?? 0)}
            hint={
              Math.abs(short) < 0.5
                ? t('dash.allSquare')
                : `${short > 0 ? t('dash.collectionShort') : t('dash.collectionOver')}: ${money(Math.abs(short))}`
            }
            tone={Math.abs(short) < 0.5 ? 'ok' : short > 0 ? 'danger' : 'accent'}
          />
        </div>

        <TableWrap>
          <tbody>
            <Line label={t('mode.cash')} value={money(day?.collected_cash ?? 0)} />
            <Line label={t('mode.upi')} value={money(day?.collected_upi ?? 0)} />
            <Line label={t('mode.card')} value={money(day?.collected_card ?? 0)} />
            <Line
              label={t('day.receipts')}
              value={money(day?.customer_receipts ?? 0)}
              hint={`${t('mode.cash')}: ${money(day?.receipts_cash ?? 0)}`}
            />
            <Line
              label={t('exp.title')}
              value={`− ${money(day?.expenses ?? 0)}`}
              hint={`${t('mode.cash')}: ${money(day?.expenses_cash ?? 0)}`}
            />
            <Line
              label={t('staff.payments')}
              value={`− ${money(day?.staff_paid ?? 0)}`}
              hint={`${t('mode.cash')}: ${money(day?.staff_paid_cash ?? 0)}`}
            />
            <Line label={t('bank.title')} value={`− ${money(day?.deposited ?? 0)}`} />
            <Line label={t('day.expectedCash')} value={money(day?.expected_cash ?? 0)} strong />
            {day?.counted_cash != null ? (
              <Line label={t('day.countedCash')} value={money(day.counted_cash)} strong />
            ) : null}
            {day?.counted_cash != null ? (
              <Line
                label={t('day.difference')}
                value={money(cashDiff)}
                strong
                tone={Math.abs(cashDiff) < 0.5 ? 'ok' : 'danger'}
              />
            ) : null}
          </tbody>
        </TableWrap>
      </Card>

      {/* ------------------------------------------------------- actions -- */}
      <div className="no-print mt-5 grid gap-4 lg:grid-cols-2">
        {!approved ? (
          <Card>
            <CardHeader title={t('day.submit')} />
            <div className="p-5">
              <SubmitDayForm
                date={date}
                expected={day?.expected_cash ?? 0}
                counted={day?.counted_cash ?? null}
                notes={day?.notes ?? null}
              />
            </div>
          </Card>
        ) : null}

        {owner ? (
          <Card>
            <CardHeader
              title={approved ? t('day.reopen') : t('day.approve')}
              subtitle={approved ? t('day.locked') : undefined}
            />
            <div className="p-5">
              {approved ? <ReopenDayForm date={date} /> : <ApproveDayForm date={date} />}
            </div>
          </Card>
        ) : approved ? (
          <Card>
            <div className="flex items-center gap-3 p-5">
              <Lock className="size-5 text-neutral-600" aria-hidden />
              <div>
                <div className="font-medium">{t('day.locked')}</div>
                {closing?.owner_remarks ? (
                  <p className="mt-1 text-sm text-neutral-600">{closing.owner_remarks}</p>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      {approved && closing?.owner_remarks ? (
        <div className="mt-4">
          <Alert tone="ok">
            {t('day.remarks')}: {closing.owner_remarks}
          </Alert>
        </div>
      ) : null}

      {/* -------------------------------------------------- recent days -- */}
      <div className="no-print mt-6">
        <Card>
          <CardHeader title={t('nav.day')} />
          {recent.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th className="text-right">{t('day.countedCash')}</Th>
                  <Th>{t('common.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <Link
                        href={`/day?date=${d.business_date}`}
                        className="font-medium hover:underline"
                      >
                        {formatDateLong(d.business_date)}
                      </Link>
                    </Td>
                    <Td className="tabular text-right">{money(d.counted_cash)}</Td>
                    <Td>
                      <Badge tone={tone[d.status]}>
                        {t(`shift.${d.status === 'draft' ? 'open' : d.status}`)}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}

function Line({
  label,
  value,
  hint,
  strong,
  tone,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
  tone?: 'ok' | 'danger'
}) {
  return (
    <tr>
      <Td>
        <span className={strong ? 'font-semibold' : ''}>{label}</span>
        {hint ? <div className="text-sm text-neutral-600">{hint}</div> : null}
      </Td>
      <Td
        className={`tabular text-right ${strong ? 'font-semibold' : ''} ${
          tone === 'ok' ? 'text-accent-2-700' : tone === 'danger' ? 'text-danger' : ''
        }`}
      >
        {value}
      </Td>
    </tr>
  )
}
