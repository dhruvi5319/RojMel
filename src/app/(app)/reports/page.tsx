import { requireOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, litres, money, monthEnd, monthStart, todayIST } from '@/lib/format'
import type { MarginReport, SalesByDay, SalesByFuel } from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'
import { PrintButton } from '@/components/PrintButton'
import { RangePicker } from './RangePicker'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  // Margin is owner business. requireOwner sends a manager back to the
  // dashboard, and margin_report() refuses her a second time in the database.
  await requireOwner()
  const sp = await searchParams
  const today = todayIST()
  const from = sp.from || monthStart(today)
  const to = sp.to || monthEnd(today)

  const t = await getT()
  const supabase = await createClient()

  const [marginRes, dailyRes, fuelRes] = await Promise.all([
    supabase.rpc('margin_report', { p_from: from, p_to: to }),
    supabase.rpc('sales_by_day', { p_from: from, p_to: to }),
    supabase.rpc('sales_by_fuel', { p_from: from, p_to: to }),
  ])

  const margin = (marginRes.data ?? null) as MarginReport | null
  const daily = (dailyRes.data ?? []) as SalesByDay[]
  const byFuel = (fuelRes.data ?? []) as SalesByFuel[]

  const grossProfit =
    margin && margin.gross_margin_per_litre != null
      ? margin.gross_margin_per_litre * margin.litres_sold
      : null

  const traded = daily.filter((d) => d.meter_sales > 0)

  return (
    <>
      <PageHeader
        title={t('rep.title')}
        subtitle={`${formatDate(from)} – ${formatDate(to)}`}
        action={
          <>
            <RangePicker from={from} to={to} />
            <PrintButton />
          </>
        }
      />

      <div className="mb-5">
        <Badge tone="accent">{t('rep.ownerOnly')}</Badge>
      </div>

      {/* --------------------------------------------------------- money -- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('rep.salesValue')}
          value={money(margin?.sales_value ?? 0)}
          hint={litres(margin?.litres_sold ?? 0)}
          tone="accent"
        />
        <Stat
          label={t('rep.purchaseCost')}
          value={money(margin?.purchase_cost ?? 0)}
          hint={litres(margin?.litres_bought ?? 0)}
        />
        <Stat
          label={t('rep.marginPerLitre')}
          value={
            margin?.gross_margin_per_litre != null
              ? `₹${margin.gross_margin_per_litre.toFixed(3)}`
              : '—'
          }
          hint={
            margin?.avg_sale_rate != null && margin?.avg_purchase_rate != null
              ? `₹${margin.avg_sale_rate.toFixed(2)} − ₹${margin.avg_purchase_rate.toFixed(2)}`
              : undefined
          }
          tone="ok"
        />
        <Stat
          label={t('rep.opex')}
          value={money(margin?.operating_expenses ?? 0)}
          hint={t('exp.title')}
          tone="accent"
        />
      </div>

      {margin?.gross_margin_per_litre == null ? (
        <div className="mt-4">
          <Alert tone="accent">
            Margin needs both sales and a purchase rate in this period. Record a
            tanker delivery with its rate to see it.
          </Alert>
        </div>
      ) : (
        <div className="mt-4">
          <Alert tone="accent">
            {t('rep.grossProfit')} on litres sold:{' '}
            <strong>{money(grossProfit ?? 0)}</strong> — before{' '}
            {money(margin.operating_expenses)} of running costs.
          </Alert>
        </div>
      )}

      {/* ---------------------------------------------------- by product -- */}
      <div className="mt-6">
        <Card>
          <CardHeader title={t('set.fuels')} />
          {byFuel.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.fuel')}</Th>
                  <Th className="text-right">{t('common.litres')}</Th>
                  <Th className="text-right">{t('rep.salesValue')}</Th>
                  <Th className="text-right">{t('common.rate')}</Th>
                </tr>
              </thead>
              <tbody>
                {byFuel.map((f) => (
                  <tr key={f.fuel_type_id}>
                    <Td className="font-medium">{f.fuel_name}</Td>
                    <Td className="tabular text-right">{litres(f.litres_sold)}</Td>
                    <Td className="tabular text-right font-semibold">
                      {money(f.sales_value)}
                    </Td>
                    <Td className="tabular text-right text-neutral-600">
                      {f.avg_rate != null ? `₹${f.avg_rate.toFixed(2)}` : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      {/* -------------------------------------------------------- by day -- */}
      <div className="mt-6">
        <Card>
          <CardHeader
            title={t('rep.sales')}
            subtitle={`${traded.length} trading days`}
          />
          {traded.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th className="text-right">{t('common.litres')}</Th>
                  <Th className="text-right">{t('day.meterSales')}</Th>
                  <Th className="text-right">{t('dash.creditGiven')}</Th>
                  <Th className="text-right">{t('shift.collections')}</Th>
                  <Th className="text-right">{t('exp.title')}</Th>
                  <Th className="text-right">{t('bank.title')}</Th>
                </tr>
              </thead>
              <tbody>
                {traded.map((d) => (
                  <tr key={d.business_date}>
                    <Td className="whitespace-nowrap">{formatDate(d.business_date)}</Td>
                    <Td className="tabular text-right">{litres(d.litres_sold)}</Td>
                    <Td className="tabular text-right font-semibold">
                      {money(d.meter_sales)}
                    </Td>
                    <Td className="tabular text-right">{money(d.credit_sales)}</Td>
                    <Td className="tabular text-right">{money(d.collected)}</Td>
                    <Td className="tabular text-right">{money(d.expenses)}</Td>
                    <Td className="tabular text-right">{money(d.deposited)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-200 font-semibold">
                  <Td>{t('common.total')}</Td>
                  <Td className="tabular text-right">
                    {litres(traded.reduce((s, d) => s + Number(d.litres_sold), 0))}
                  </Td>
                  <Td className="tabular text-right">
                    {money(traded.reduce((s, d) => s + Number(d.meter_sales), 0))}
                  </Td>
                  <Td className="tabular text-right">
                    {money(traded.reduce((s, d) => s + Number(d.credit_sales), 0))}
                  </Td>
                  <Td className="tabular text-right">
                    {money(traded.reduce((s, d) => s + Number(d.collected), 0))}
                  </Td>
                  <Td className="tabular text-right">
                    {money(traded.reduce((s, d) => s + Number(d.expenses), 0))}
                  </Td>
                  <Td className="tabular text-right">
                    {money(traded.reduce((s, d) => s + Number(d.deposited), 0))}
                  </Td>
                </tr>
              </tfoot>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
