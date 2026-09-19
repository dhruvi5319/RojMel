import Link from 'next/link'
import { requireBackOffice , pumpToday } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import {formatDate, money} from '@/lib/format'
import type { DayBookEntry } from '@/lib/database.types'
import {
  Badge, Card, CardHeader, Empty, PageHeader, Stat, TableWrap, Td, Th, rowClass,
} from '@/components/ui'
import { Calendar } from './Calendar'

export const dynamic = 'force-dynamic'

/**
 * Every day the pump has traded, kept and reachable. Nothing here is computed
 * fresh — it is the same shifts and takings already recorded, gathered a month
 * at a time so a date can be found by looking rather than by stepping.
 */
export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const today = pumpToday(session)
  const month = (await searchParams).month || today.slice(0, 7)

  const { data } = await supabase.rpc('day_book_month', { p_month: `${month}-01` })
  const entries = (data ?? []) as DayBookEntry[]

  const sold = entries.reduce((s, e) => s + Number(e.total_sale), 0)
  const approved = entries.filter((e) => e.approved).length
  const waiting = entries.filter((e) => !e.approved).length
  const offBalance = entries.filter((e) => Math.abs(Number(e.difference)) >= 0.5)

  return (
    <>
      <PageHeader title={t('book.title')} subtitle={t('book.subtitle')} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('book.days')} value={String(entries.length)} />
        <Stat label={t('book.sold')} value={money(sold)} tone="accent" />
        <Stat label={t('book.approved')} value={String(approved)} tone="ok" />
        <Stat
          label={t('book.notBalanced')}
          value={String(offBalance.length)}
          hint={waiting > 0 ? `${waiting} ${t('book.waiting').toLowerCase()}` : undefined}
          tone={offBalance.length > 0 ? 'danger' : 'plain'}
        />
      </div>

      <Card className="mb-5 p-5">
        <Calendar month={month} entries={entries} today={today} />
      </Card>

      <Card className="overflow-hidden pb-1">
        <CardHeader title={t('book.days')} />
        {entries.length === 0 ? (
          <Empty>{t('book.noneThisMonth')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.date')}</Th>
                <Th className="text-right">{t('nav.shifts')}</Th>
                <Th className="text-right">{t('money.sold')}</Th>
                <Th className="text-right">{t('money.accounted')}</Th>
                <Th className="text-right">{t('money.difference')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((e) => {
                const off = Math.abs(Number(e.difference)) >= 0.5
                return (
                  <tr key={e.business_date} className={rowClass}>
                    <Td>
                      <Link
                        href={`/moneylog?date=${e.business_date}`}
                        className="font-medium hover:underline"
                      >
                        {formatDate(e.business_date)}
                      </Link>
                    </Td>
                    <Td className="tabular text-right text-neutral-600">{e.shifts}</Td>
                    <Td className="tabular text-right font-semibold">
                      {money(e.total_sale)}
                    </Td>
                    <Td className="tabular text-right">{money(e.accounted)}</Td>
                    <Td
                      className={`tabular text-right ${off ? 'font-semibold text-danger' : 'text-neutral-600'}`}
                    >
                      {money(e.difference)}
                    </Td>
                    <Td>
                      <Badge tone={e.approved ? 'ok' : 'accent'}>
                        {e.approved ? t('book.approved') : t('book.waiting')}
                      </Badge>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
