import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, Banknote, CheckCircle2,
  Fuel, Plus, Receipt, TriangleAlert, Truck,
} from 'lucide-react'
import { requireBackOffice, isOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong, litres, money, moneyCompact, todayIST } from '@/lib/format'
import type { CustomerBalance, DaySummary, TankStock } from '@/lib/database.types'
import { Alert, Badge, Card, CardHeader, Empty, LinkButton, Stat, Td, TableWrap } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const session = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()

  const [summaryRes, balancesRes, stockRes, nozzleRes, pendingRes] = await Promise.all([
    supabase.rpc('day_summary', { p_date: today }),
    supabase
      .from('v_customer_balances')
      .select('*')
      .eq('is_active', true)
      .order('balance', { ascending: false })
      .limit(5),
    supabase.from('v_tank_stock').select('*').order('name'),
    supabase.from('nozzles').select('id').limit(1),
    supabase
      .from('day_closings')
      .select('business_date, counted_cash')
      .eq('status', 'submitted')
      .order('business_date', { ascending: false })
      .limit(5),
  ])

  const day = (summaryRes.data ?? null) as DaySummary | null
  const debtors = (balancesRes.data ?? []) as CustomerBalance[]
  const tanks = (stockRes.data ?? []) as TankStock[]
  const pending = pendingRes.data ?? []
  const notSetUp = (nozzleRes.data ?? []).length === 0

  const short = day?.collection_short ?? 0
  const outstanding = debtors.reduce((sum, c) => sum + Number(c.balance), 0)

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('dash.todaySales')}
        </h1>
        <p className="mt-1 text-muted">{formatDateLong(today)}</p>
      </div>

      {notSetUp ? (
        <div className="mb-5">
          <Alert tone="accent">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                No nozzles set up yet. Add your fuels, tanks and nozzles before
                recording a shift.
              </span>
              <Link href="/settings" className="font-semibold underline">
                {t('nav.settings')} →
              </Link>
            </div>
          </Alert>
        </div>
      ) : null}

      {isOwner(session) && pending.length > 0 ? (
        <div className="mb-5">
          <Alert tone="brand">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">
                {t('dash.pendingApproval')} — {pending.length}
              </span>
              <Link href="/day" className="font-semibold underline">
                {t('nav.day')} →
              </Link>
            </div>
          </Alert>
        </div>
      ) : null}

      {/* ------------------------------------------------ the day's money -- */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label={t('day.meterSales')}
          value={money(day?.meter_sales ?? 0)}
          hint={litres(day?.litres_sold ?? 0)}
          tone="brand"
        />
        <Stat
          label={t('dash.creditGiven')}
          value={money(day?.credit_sales ?? 0)}
          hint={t('nav.credit')}
        />
        <Stat
          label={t('dash.cashExpected')}
          value={money(day?.counter_sales ?? 0)}
          hint={`${t('shift.collections')}: ${money(day?.collected_total ?? 0)}`}
        />
        <Stat
          label={t('dash.cashInHand')}
          value={money(day?.expected_cash ?? 0)}
          hint={`${t('dash.deposited')}: ${money(day?.deposited ?? 0)}`}
          tone="accent"
        />
      </div>

      {/* Whether the fillers are square is the first thing father will ask. */}
      <div className="mt-4">
        {Math.abs(short) < 0.5 ? (
          <Alert tone="ok">
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-[18px]" aria-hidden />
              {t('dash.allSquare')}
            </span>
          </Alert>
        ) : (
          <Alert tone={short > 0 ? 'danger' : 'accent'}>
            <span className="inline-flex items-center gap-2 font-medium">
              <TriangleAlert className="size-[18px]" aria-hidden />
              {short > 0 ? t('dash.collectionShort') : t('dash.collectionOver')}
              {' — '}
              <span className="tabular">{money(Math.abs(short))}</span>
            </span>
          </Alert>
        )}
      </div>

      {/* -------------------------------------------------- quick actions -- */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/shifts" icon={Fuel} label={t('shift.readings')} />
        <QuickAction href="/credit/new" icon={Truck} label={t('credit.new')} />
        <QuickAction href="/payments" icon={Receipt} label={t('pay.new')} />
        <QuickAction href="/bank" icon={Banknote} label={t('bank.new')} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------ outstanding -- */}
        <Card>
          <CardHeader
            title={t('dash.topDebtors')}
            subtitle={`${t('dash.outstanding')}: ${moneyCompact(outstanding)}`}
            action={
              <LinkButton href="/customers" variant="secondary" size="sm">
                {t('common.all')}
                <ArrowRight className="size-4" aria-hidden />
              </LinkButton>
            }
          />
          {debtors.length === 0 ? (
            <Empty>{t('cust.noCustomers')}</Empty>
          ) : (
            <TableWrap>
              <tbody>
                {debtors.map((c) => {
                  const over = c.credit_limit > 0 && c.balance > c.credit_limit
                  return (
                    <tr key={c.customer_id}>
                      <Td>
                        <Link
                          href={`/customers/${c.customer_id}`}
                          className="font-medium hover:underline"
                        >
                          {c.name}
                        </Link>
                        {over ? (
                          <span className="ml-2">
                            <Badge tone="danger">{t('credit.overLimit')}</Badge>
                          </span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-right font-semibold">
                        {money(c.balance)}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>

        {/* ------------------------------------------------------ stock -- */}
        <Card>
          <CardHeader
            title={t('stock.title')}
            action={
              <LinkButton href="/stock" variant="secondary" size="sm">
                {t('common.all')}
                <ArrowRight className="size-4" aria-hidden />
              </LinkButton>
            }
          />
          {tanks.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <div className="flex flex-col gap-4 p-4">
              {tanks.map((tank) => {
                const pct = tank.capacity_litres
                  ? Math.max(
                      0,
                      Math.min(100, (tank.book_stock_litres / tank.capacity_litres) * 100),
                    )
                  : 0
                const low = pct < 20
                return (
                  <div key={tank.tank_id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {tank.name}
                        <span className="ml-2 text-sm text-muted">
                          {tank.fuel_name}
                        </span>
                      </span>
                      <span className="tabular text-sm font-semibold">
                        {litres(tank.book_stock_litres)}
                      </span>
                    </div>
                    <div
                      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
                      role="img"
                      aria-label={`${tank.name} ${pct.toFixed(0)} percent full`}
                    >
                      <div
                        className={`h-full rounded-full ${low ? 'bg-danger' : 'bg-brand'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {low ? (
                      <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-danger">
                        <AlertTriangle className="size-4" aria-hidden />
                        {t('dash.lowStock')}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Plus
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center text-sm font-medium transition hover:border-brand hover:bg-brand-soft"
    >
      <Icon className="size-6 text-brand" aria-hidden />
      {label}
    </Link>
  )
}
