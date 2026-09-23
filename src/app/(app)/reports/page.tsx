import { requireOwner , pumpToday } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import {formatDate, litres, money, monthEnd, monthStart, quantity} from '@/lib/format'
import type { FuelMargin, MarginReport, SalesByDay } from '@/lib/database.types'
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
  const session = await requireOwner()
  const sp = await searchParams
  const today = pumpToday(session)
  const from = sp.from || monthStart(today)
  const to = sp.to || monthEnd(today)

  const t = await getT()
  const supabase = await createClient()

  const [marginRes, dailyRes, fuelRes] = await Promise.all([
    supabase.rpc('margin_report', { p_from: from, p_to: to }),
    supabase.rpc('sales_by_day', { p_from: from, p_to: to }),
    // Per fuel, valued at what that fuel cost — petrol and diesel are
    // different businesses and one blended figure hides the thin one.
    supabase.rpc('margin_by_fuel', { p_from: from, p_to: to }),
  ])

  const margin = (marginRes.data ?? null) as MarginReport | null
  const daily = (dailyRes.data ?? []) as SalesByDay[]
  const byFuel = (fuelRes.data ?? []) as FuelMargin[]

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
        {/* What the fuel that was SOLD cost. Not the tankers that happened to
            arrive in the same window — they come when the tanks need them, so
            the two are never the same and subtracting one from the other made
            a month with an extra load read as a disaster. */}
        <Stat
          label={t('rep.costOfSales')}
          value={money(margin?.cost_of_sales ?? 0)}
          hint={t('rep.costOfSalesHint')}
        />
        <Stat
          label={t('rep.marginPerLitre')}
          value={
            margin?.gross_margin_per_litre != null
              ? `₹${margin.gross_margin_per_litre.toFixed(3)}`
              : '—'
          }
          hint={
            // The working under the answer, and it has to come to the answer:
            // the selling rate over the priced litres, to three places like
            // the margin itself. Averaging every litre sold and rounding to
            // two made this subtraction miss by paisa — or by rupees, once a
            // fuel with no tanker behind it was in the window.
            margin?.avg_sale_rate_priced != null && margin?.avg_cost_rate != null
              ? `₹${margin.avg_sale_rate_priced.toFixed(3)} − ₹${margin.avg_cost_rate.toFixed(3)}`
              : undefined
          }
          // Olive is the pump's colour for settled and right. A margin that
          // has gone negative is neither.
          tone={(margin?.gross_margin_per_litre ?? 0) < 0 ? 'danger' : 'ok'}
        />
        <Stat
          label={t('rep.opex')}
          value={money(margin?.operating_expenses ?? 0)}
          hint={t('exp.title')}
          tone="accent"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {/* A fuel with no tanker priced behind it cannot be costed, and a zero
            there would report the whole sale as profit. Name it instead. */}
        {(margin?.fuels_without_cost ?? 0) > 0 ? (
          <Alert tone="accent">
            {byFuel
              .filter((f) => !f.cost_known && f.quantity_sold > 0)
              .map((f) => f.fuel_name)
              .join(', ')}{' '}
            — {t('rep.noCostYet')}
          </Alert>
        ) : null}
        <Alert tone={(margin?.net_after_costs ?? 0) >= 0 ? 'ok' : 'danger'}>
          {t('rep.grossProfit')}: <strong>{money(margin?.gross_profit ?? 0)}</strong> —{' '}
          {t('rep.lessRunning')} {money(margin?.operating_expenses ?? 0)} ={' '}
          <strong>{money(margin?.net_after_costs ?? 0)}</strong>
        </Alert>

        {/* Tanker spend is cash leaving the pump, and belongs nowhere near the
            margin. With sixteen or seventeen loads a month on no schedule, a
            window catching two extra is not a worse month. */}
        <Alert tone="accent">
          <span className="tabular">
            {t('rep.tankersInWindow')}: <strong>{money(margin?.purchase_cost ?? 0)}</strong>{' '}
            ({litres(margin?.litres_bought ?? 0)}). {t('rep.tankersAreCash')}
          </span>
        </Alert>
      </div>

      {/* ---------------------------------------------------- by product -- */}
      <div className="mt-6">
        <Card>
          <CardHeader title={t('set.fuels')} subtitle={t('rep.perFuelHint')} />
          {byFuel.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.fuel')}</Th>
                  <Th className="text-right">{t('common.quantity')}</Th>
                  <Th className="text-right">{t('rep.salesValue')}</Th>
                  <Th className="text-right">{t('rep.costOfSales')}</Th>
                  <Th className="text-right">{t('rep.marginPerLitre')}</Th>
                </tr>
              </thead>
              <tbody>
                {byFuel.map((f) => (
                  <tr key={f.fuel_type_id}>
                    <Td className="font-medium">{f.fuel_name}</Td>
                    <Td className="tabular text-right">
                      {quantity(f.quantity_sold, f.unit)}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {money(f.sales_value)}
                    </Td>
                    <Td className="tabular text-right text-neutral-700">
                      {f.cost_known ? money(f.cost_of_sales) : t('rep.notPriced')}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {f.margin_per_unit != null
                        ? `₹${f.margin_per_unit.toFixed(3)}`
                        : '—'}
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
