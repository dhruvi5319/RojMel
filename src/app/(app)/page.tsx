import Link from 'next/link'
import {
  AlertTriangle, Banknote, Check, CircleCheckBig, Fuel, Receipt, Truck,
} from 'lucide-react'
import { requireBackOffice, isOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong, litres, money, moneyWhole, todayIST } from '@/lib/format'
import type { CustomerBalance, DaySummary, TankStock } from '@/lib/database.types'
import { Alert, Kicker, Proposal, Stat } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function TheDay({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const date = (await searchParams).date || todayIST()

  const [summaryRes, slipsRes, balancesRes, stockRes, nozzleRes] = await Promise.all([
    supabase.rpc('day_summary', { p_date: date }),
    supabase
      .from('credit_sales')
      .select('id', { count: 'exact', head: true })
      .eq('business_date', date),
    supabase
      .from('v_customer_balances')
      .select('*')
      .eq('is_active', true)
      .order('balance', { ascending: false }),
    supabase.from('v_tank_stock').select('*').order('name'),
    supabase.from('nozzles').select('id').limit(1),
  ])

  const day = (summaryRes.data ?? null) as DaySummary | null
  const slipCount = slipsRes.count ?? 0
  const customers = (balancesRes.data ?? []) as CustomerBalance[]
  const tanks = (stockRes.data ?? []) as TankStock[]
  const notSetUp = (nozzleRes.data ?? []).length === 0

  const short = day?.collection_short ?? 0
  const square = Math.abs(short) < 0.5
  const cashDiff = (day?.counted_cash ?? 0) - (day?.expected_cash ?? 0)
  const approved = day?.status === 'approved'

  /* ── the day's rhythm ─────────────────────────────────────────────────── */
  const steps = [
    {
      href: `/shifts?date=${date}`,
      label: t('shift.readings'),
      detail: `${litres(day?.litres_sold ?? 0)} · ${money(day?.meter_sales ?? 0)}`,
      done: (day?.litres_sold ?? 0) > 0,
    },
    {
      href: `/credit?date=${date}`,
      label: t('credit.title'),
      detail: `${slipCount} · ${money(day?.credit_sales ?? 0)}`,
      done: slipCount > 0,
    },
    {
      href: `/shifts?date=${date}`,
      label: t('shift.collections'),
      detail: `${money(day?.collected_total ?? 0)} · ${
        square ? t('dash.allSquare') : t('dash.collectionShort')
      }`,
      done: (day?.collected_total ?? 0) > 0,
    },
    {
      href: `/day?date=${date}`,
      label: t('day.countedCash'),
      detail:
        day?.counted_cash != null
          ? `${money(day.counted_cash)} · ${t('day.difference')} ${money(cashDiff)}`
          : t('day.expectedCash') + ' ' + money(day?.expected_cash ?? 0),
      done: day?.counted_cash != null && day.status !== 'draft',
    },
    {
      href: `/day?date=${date}`,
      label: t('day.approve'),
      detail: approved ? t('day.approved') : t('dash.pendingApproval'),
      done: approved,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length

  /* ── what needs a look ────────────────────────────────────────────────── */
  const lowTanks = tanks.filter(
    (tk) => tk.capacity_litres > 0 && tk.book_stock_litres / tk.capacity_litres < 0.2,
  )
  const overLimit = customers.filter(
    (c) => c.credit_limit > 0 && c.balance > c.credit_limit,
  )
  const unbilled = customers.reduce((s, c) => s + Number(c.unbilled_amount), 0)

  const attention = [
    ...lowTanks.map((tk) => ({
      href: '/stock',
      text: `${tk.name} · ${tk.fuel_name} — ${t('dash.lowStock')}, ${Math.max(
        0,
        Math.round((tk.book_stock_litres / tk.capacity_litres) * 100),
      )}%`,
    })),
    ...overLimit.map((c) => ({
      href: `/customers/${c.customer_id}`,
      text: `${c.name} — ${t('credit.overLimit')}`,
    })),
    ...(unbilled > 0
      ? [{ href: '/invoices', text: `${money(unbilled)} ${t('credit.unbilled')}` }]
      : []),
  ]

  // A wall of warnings is the same as none, so keep it to what can be acted
  // on now and say how many are behind it.
  const SHOWN = 4
  const shown = attention.slice(0, SHOWN)
  const moreCount = attention.length - shown.length

  return (
    <>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-start">
        {/* ─────────────────────────────────────────────── today's rhythm ── */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Kicker>
                {t('dash.rhythm')} · {doneCount} of {steps.length}
              </Kicker>
              <Proposal />
            </div>

            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <Link
                  key={i}
                  href={step.href}
                  className="flex items-center gap-3 rounded-[var(--radius-step)] bg-surface px-4 py-3 transition hover:bg-accent-100"
                >
                  <span
                    className={`grid size-[25px] shrink-0 place-items-center rounded-full ${
                      step.done
                        ? 'bg-accent-2-400 text-accent-2-900'
                        : 'bg-accent font-[family-name:var(--font-heading)] text-[13px] text-bg'
                    }`}
                  >
                    {step.done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">
                      {step.label}
                    </span>
                    <span className="tabular block text-[12px] text-neutral-600">
                      {step.detail}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {attention.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Kicker>{t('dash.needsLook')}</Kicker>
                <Proposal />
              </div>
              <div className="flex flex-col gap-2">
                {shown.map((a, i) => (
                  <Link
                    key={i}
                    href={a.href}
                    className="flex items-center gap-2.5 rounded-[var(--radius-step)] bg-surface px-4 py-3 text-[13.5px] transition hover:bg-accent-100"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-accent" />
                    {a.text}
                  </Link>
                ))}
                {moreCount > 0 ? (
                  <span className="px-4 pt-0.5 text-[12.5px] text-neutral-600">
                    +{moreCount} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* ──────────────────────────────────────────────── the day's sum ── */}
        <div>
          <Kicker>{t('dash.todaySales')}</Kicker>
          <h1 className="mt-1 mb-5 text-[28px]">{formatDateLong(date)}</h1>

          {/* Meter sales − given on credit = cash expected. The whole model of
              the pump's day, in the order father reads it. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            <Stat
              label={t('day.meterSales')}
              value={moneyWhole(day?.meter_sales ?? 0)}
              hint={litres(day?.litres_sold ?? 0)}
            />
            <Stat
              prefix="−"
              label={t('dash.creditGiven')}
              value={moneyWhole(day?.credit_sales ?? 0)}
              hint={`${slipCount} ${t('credit.title')}`}
            />
            <Stat
              prefix="="
              label={t('dash.cashExpected')}
              value={moneyWhole(day?.counter_sales ?? 0)}
              hint={`${t('shift.collections')}: ${money(day?.collected_total ?? 0)}`}
              tone="accent"
            />
            <Stat
              label={t('dash.cashInHand')}
              value={moneyWhole(day?.expected_cash ?? 0)}
              hint={`${t('dash.deposited')}: ${money(day?.deposited ?? 0)}`}
            />
          </div>

          <div className="mt-4">
            {square ? (
              <div className="flex items-center gap-2.5 rounded-[22px] bg-accent-2-100 px-4 py-3">
                <CircleCheckBig
                  className="size-[19px] text-accent-2-700"
                  aria-hidden
                />
                <span className="font-semibold text-accent-2-800">
                  {t('dash.allSquare')}
                </span>
              </div>
            ) : (
              <Alert tone={short > 0 ? 'danger' : 'accent'}>
                <span className="inline-flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-[18px]" aria-hidden />
                  {short > 0 ? t('dash.collectionShort') : t('dash.collectionOver')}
                  {' — '}
                  <span className="tabular">{money(Math.abs(short))}</span>
                </span>
              </Alert>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction href={`/shifts?date=${date}`} icon={Fuel} label={t('shift.readings')} />
            <QuickAction href={`/credit/new?date=${date}`} icon={Truck} label={t('credit.new')} />
            <QuickAction href="/payments/new" icon={Receipt} label={t('pay.new')} />
            <QuickAction href="/bank" icon={Banknote} label={t('bank.new')} />
          </div>

          {isOwner(session) && !approved && day?.status === 'submitted' ? (
            <div className="mt-5">
              <Alert tone="accent">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold">{t('dash.pendingApproval')}</span>
                  <Link href={`/day?date=${date}`} className="font-semibold underline">
                    {t('nav.day')} →
                  </Link>
                </div>
              </Alert>
            </div>
          ) : null}
        </div>
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
  icon: typeof Fuel
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-[var(--radius-step)] bg-surface px-3 py-5 text-center text-[13px] font-semibold transition hover:bg-accent-100"
    >
      <Icon className="size-[22px] text-accent" aria-hidden />
      {label}
    </Link>
  )
}
