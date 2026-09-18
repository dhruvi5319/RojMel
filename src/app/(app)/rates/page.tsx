import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, formatTime } from '@/lib/format'
import type { FuelPrice, FuelRate } from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, TableWrap, Td, Th, rowClass,
} from '@/components/ui'
import { TodaysRates } from '@/components/TodaysRates'

export const dynamic = 'force-dynamic'

interface PriceRow extends FuelPrice {
  fuel_types: { name: string; unit: 'L' | 'kg' } | null
  profiles: { full_name: string } | null
}

/**
 * Rates live in Today because pump prices move daily — this is a morning job,
 * not a settings job, and every figure the day produces is priced off it.
 *
 * The fuel itself stays in Settings: adding or renaming one is equipment, and
 * the owner's business.
 */
export default async function RatesPage() {
  const session = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()

  const [ratesRes, historyRes] = await Promise.all([
    supabase.from('v_fuel_rates').select('*').order('sort_order'),
    supabase
      .from('fuel_prices')
      .select('*, fuel_types(name, unit), profiles(full_name)')
      .order('effective_from', { ascending: false })
      .limit(400),
  ])

  const rates = (ratesRes.data ?? []) as FuelRate[]
  const stale = rates.filter((r) => !r.set_today)

  // Saving a rate that is already in force appends a row but changes no price.
  // The page is asking "when did the price move", so a run of the same figure
  // reads as the one moment it moved — the oldest row of the run.
  const all = (historyRes.data ?? []) as unknown as PriceRow[]
  const history = all
    .filter((p, i) => {
      const older = all.slice(i + 1).find((h) => h.fuel_type_id === p.fuel_type_id)
      return !older || Number(older.sale_rate) !== Number(p.sale_rate)
    })
    .slice(0, 50)

  return (
    <>
      <PageHeader title={t('rate.today')} subtitle={t('rate.pageSubtitle')} />

      {stale.length > 0 ? (
        <div className="mb-5">
          <Alert tone="accent">
            <strong>{t('rate.staleWarning')}</strong>{' '}
            {stale.slice(0, 3).map((r) => r.name).join(', ')}
            {stale.length > 3 ? ` +${stale.length - 3}` : ''}
          </Alert>
        </div>
      ) : null}

      <div className="mb-5">
        <TodaysRates rates={rates} />
      </div>

      <Card className="overflow-hidden pb-1">
        <CardHeader title={t('rate.history')} subtitle={t('rate.appendOnly')} />
        {history.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('set.effectiveFrom')}</Th>
                <Th>{t('common.fuel')}</Th>
                <Th className="text-right">{t('common.rate')}</Th>
                <Th>{t('rate.changedBy')}</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((p, i) => {
                // The newest row for a fuel is the one in force now.
                const current =
                  history.findIndex((h) => h.fuel_type_id === p.fuel_type_id) === i
                return (
                  <tr key={p.id} className={rowClass}>
                    <Td className="whitespace-nowrap">
                      {formatDate(p.effective_from)}
                      <span className="ml-2 text-[12px] text-neutral-600">
                        {formatTime(p.effective_from)}
                      </span>
                    </Td>
                    <Td>
                      {p.fuel_types?.name ?? '—'}
                      {current ? (
                        <span className="ml-2">
                          <Badge tone="ok">{t('set.currentRate')}</Badge>
                        </span>
                      ) : null}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      ₹{Number(p.sale_rate).toFixed(2)}
                      <span className="text-[12px] text-neutral-600">
                        /{p.fuel_types?.unit ?? 'L'}
                      </span>
                    </Td>
                    <Td className="text-neutral-600">
                      {p.profiles?.full_name ?? '—'}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {isOwner(session) ? (
        <p className="mt-4 text-[12.5px] text-neutral-600">
          {t('rate.fuelsInSettings')}
        </p>
      ) : null}
    </>
  )
}
