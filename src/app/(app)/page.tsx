import Link from 'next/link'
import {
  AlertTriangle, Banknote, Check, CircleCheckBig, Fuel, Receipt, Truck,
} from 'lucide-react'
import { requireBackOffice, isOwner, pumpToday } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong, litres, money, moneyWhole, monthStart } from '@/lib/format'
import { shiftLabel } from '@/lib/shifts'
import type {
  CustomerBalance, DayClosing, DaySummary, FuelRate, MarginReport, ShiftMoney, TankCover,
} from '@/lib/database.types'
import { Alert, Kicker, Stat } from '@/components/ui'
import { TodaysRates } from '@/components/TodaysRates'

export const dynamic = 'force-dynamic'

/**
 * Two jobs, two screens.
 *
 * The manager is working the day — rates, the fillers' figures, the cash box,
 * handing it over. The owner is judging it and watching the business. They used
 * to get the same page with a different badge on it, so the owner's first line
 * was "Today's rate — Manager" and five of his six steps belonged to somebody
 * else, while the one thing only he can see — cost and margin — sat behind the
 * least-visited door in the app. Each now opens on their own question.
 */
export default async function TheDay({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const date = (await searchParams).date || pumpToday(session)
  const owner = isOwner(session)

  const [summaryRes, slipsRes, balancesRes, stockRes, nozzleRes, ratesRes, moneyRes] =
    await Promise.all([
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
      supabase.from('v_tank_cover').select('*').order('name'),
      supabase.from('nozzles').select('id').limit(1),
      supabase.from('v_fuel_rates').select('*').order('sort_order'),
      // Which half of the day is out, and by how much — what makes a day wrong
      // rather than merely unfinished.
      supabase.from('v_shift_money').select('*').eq('business_date', date).order('sort_order'),
    ])

  const day = (summaryRes.data ?? null) as DaySummary | null
  const slipCount = slipsRes.count ?? 0
  const customers = (balancesRes.data ?? []) as CustomerBalance[]
  const tanks = (stockRes.data ?? []) as TankCover[]
  const notSetUp = (nozzleRes.data ?? []).length === 0
  const rates = (ratesRes.data ?? []) as FuelRate[]
  const staleRates = rates.filter((r) => !r.set_today)
  const shifts = (moneyRes.data ?? []) as ShiftMoney[]

  const short = day?.collection_short ?? 0
  const square = Math.abs(short) < 0.5
  const cashDiff = (day?.counted_cash ?? 0) - (day?.expected_cash ?? 0)
  const approved = day?.status === 'approved'
  const outOfBalance = shifts.filter((s) => Math.abs(Number(s.difference)) >= 0.5)

  /* ── what needs a look, whoever is looking ────────────────────────────── */
  const lowTanks = tanks.filter((tk) => tk.days_left != null && tk.days_left < 3)
  const overLimit = customers.filter((c) => c.credit_limit > 0 && c.balance > c.credit_limit)
  const unbilled = customers.reduce((s, c) => s + Number(c.unbilled_amount), 0)

  const attention = [
    ...outOfBalance.map((s) => ({
      href: `/moneylog?date=${date}`,
      text: `${shiftLabel(t, s.name)} — ${money(Math.abs(Number(s.difference)))} ${
        Number(s.difference) > 0 ? t('dash.collectionShort') : t('dash.collectionOver')
      }`,
    })),
    ...lowTanks.map((tk) => ({
      href: '/stock',
      text: `${tk.name} · ${tk.fuel_name} — ${tk.days_left!.toFixed(1)} ${t('stock.daysLeft')}`,
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
  const shown = attention.slice(0, 4)
  const moreCount = attention.length - shown.length

  const setUpWarning = notSetUp ? (
    <div className="mb-5">
      <Alert tone="accent">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{t('dash.notSetUp')}</span>
          <Link href="/settings" className="font-semibold underline">
            {t('nav.settings')} →
          </Link>
        </div>
      </Alert>
    </div>
  ) : null

  const needsALook =
    attention.length > 0 ? (
      <div>
        <div className="mb-3">
          <Kicker>{t('dash.needsLook')}</Kicker>
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
            <span className="px-4 pt-0.5 text-[12.5px] text-neutral-700">
              +{moreCount} {t('dash.more')}
            </span>
          ) : null}
        </div>
      </div>
    ) : null

  /* Meter sales − given on credit = cash expected. The whole model of the
     pump's day, in the order it is read. */
  const theChain = (
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
  )

  const verdict = square ? (
    <div className="flex items-center gap-2.5 rounded-[22px] bg-accent-2-100 px-4 py-3">
      <CircleCheckBig className="size-[19px] text-accent-2-700" aria-hidden />
      <span className="font-semibold text-accent-2-800">{t('dash.allSquare')}</span>
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
  )

  if (!owner) {
    return (
      <ManagerDay
        date={date}
        day={day}
        t={t}
        rates={rates}
        staleRates={staleRates}
        slipCount={slipCount}
        shifts={shifts}
        outOfBalance={outOfBalance}
        theChain={theChain}
        verdict={verdict}
        needsALook={needsALook}
        setUpWarning={setUpWarning}
        approved={approved}
        cashDiff={cashDiff}
      />
    )
  }

  /* ── the owner ───────────────────────────────────────────────────────── */
  const [waitingRes, marginRes] = await Promise.all([
    // Days the manager has handed over and he has not closed. There is often
    // more than one, and the screen only ever mentioned today.
    supabase
      .from('day_closings')
      .select('*')
      .eq('status', 'submitted')
      .order('business_date', { ascending: false })
      .limit(4),
    supabase.rpc('margin_report', { p_from: monthStart(date), p_to: date }),
  ])
  const waiting = (waitingRes.data ?? []) as DayClosing[]
  const margin = (marginRes.data ?? null) as MarginReport | null

  return (
    <>
      {setUpWarning}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>
            {waiting.length > 0
              ? `${waiting.length} ${t('dash.waitingForYou')}`
              : t('dash.nothingWaiting')}
          </Kicker>
          <h1 className="mt-1 text-[28px]">{formatDateLong(date)}</h1>
        </div>
        <div className="max-w-md">{verdict}</div>
      </div>

      {/* The days that are his to close. */}
      {waiting.length > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {waiting.map((d) => (
            <Link
              key={d.id}
              href={`/day?date=${d.business_date}`}
              className={`rounded-[var(--radius-card)] bg-surface px-5 py-4 transition hover:bg-accent-100 ${
                d.business_date === date ? 'ring-2 ring-accent' : ''
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{formatDateLong(d.business_date)}</span>
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11.5px] font-bold text-bg">
                  {t('dash.yoursToClose')}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  <span className="block text-[11.5px] text-neutral-700">
                    {t('day.countedCash')}
                  </span>
                  <span className="tabular text-[17px] font-bold">{money(d.counted_cash)}</span>
                </span>
                {d.notes ? (
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] text-neutral-700">
                      {t('common.notes')}
                    </span>
                    <span className="line-clamp-2 text-[13px]">{d.notes}</span>
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {/* The month, which is his unit — and the one thing only he may see. */}
      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Kicker>{t('dash.monthSoFar')}</Kicker>
          <span className="rounded-full bg-accent-200 px-2.5 py-0.5 text-[11px] font-bold text-accent-800">
            {t('rep.ownerOnly')}
          </span>
          <Link href="/reports" className="ml-auto text-[13px] font-semibold text-accent">
            {t('rep.title')} →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat
            label={t('rep.salesValue')}
            value={moneyWhole(margin?.sales_value ?? 0)}
            hint={litres(margin?.litres_sold ?? 0)}
          />
          <Stat label={t('rep.costOfSales')} value={moneyWhole(margin?.cost_of_sales ?? 0)} />
          <Stat
            label={t('rep.marginPerLitre')}
            value={
              margin?.gross_margin_per_litre != null
                ? `₹${margin.gross_margin_per_litre.toFixed(2)}`
                : '—'
            }
            tone="ok"
          />
          <Stat label={t('rep.opex')} value={moneyWhole(margin?.operating_expenses ?? 0)} />
          <Stat
            label={t('dash.leftAfterCosts')}
            value={moneyWhole(margin?.net_after_costs ?? 0)}
            tone={(margin?.net_after_costs ?? 0) >= 0 ? 'ok' : 'danger'}
          />
        </div>
        {(margin?.fuels_without_cost ?? 0) > 0 ? (
          <p className="mt-2 text-[12.5px] text-neutral-700">{t('dash.someFuelUnpriced')}</p>
        ) : null}
      </div>

      <div className="mb-3">
        <Kicker>{t('dash.todaySales')}</Kicker>
      </div>
      {theChain}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction href={`/moneylog?date=${date}`} icon={Receipt} label={t('nav.money')} />
          <QuickAction href={`/day?date=${date}`} icon={CircleCheckBig} label={t('nav.day')} />
          <QuickAction href="/reports" icon={Banknote} label={t('nav.reports')} />
          <QuickAction href="/daybook" icon={Fuel} label={t('nav.daybook')} />
        </div>
        {needsALook}
      </div>

      {!approved && day?.status === 'submitted' ? (
        <div className="mt-5">
          <Alert tone="accent">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-semibold">
                {t('dash.readyForOwner')} · {t('day.difference')} {money(cashDiff)}
              </span>
              <Link href={`/day?date=${date}`} className="font-semibold underline">
                {t('nav.day')} →
              </Link>
            </div>
          </Alert>
        </div>
      ) : !approved ? (
        <div className="mt-5">
          <Alert tone="accent">{t('dash.dayWithManager')}</Alert>
        </div>
      ) : null}
    </>
  )
}

/* ───────────────────────────────────────────────────────── the manager ── */
/**
 * What is left to do today, in her order — and the fillers' half shown as
 * something that has happened rather than four more tasks with her name on
 * them.
 */
function ManagerDay({
  date,
  day,
  t,
  rates,
  staleRates,
  slipCount,
  shifts,
  outOfBalance,
  theChain,
  verdict,
  needsALook,
  setUpWarning,
  approved,
  cashDiff,
}: {
  date: string
  day: DaySummary | null
  t: Awaited<ReturnType<typeof getT>>
  rates: FuelRate[]
  staleRates: FuelRate[]
  slipCount: number
  shifts: ShiftMoney[]
  outOfBalance: ShiftMoney[]
  theChain: React.ReactNode
  verdict: React.ReactNode
  needsALook: React.ReactNode
  setUpWarning: React.ReactNode
  approved: boolean
  cashDiff: number
}) {
  const counted = day?.counted_cash != null
  const handedOver = day?.status === 'submitted' || approved

  const mine = [
    {
      href: '/rates',
      label: t('rate.today'),
      detail:
        rates.length === 0
          ? t('rate.noneYet')
          : staleRates.length === 0
            ? `${rates.length} · ${t('rate.allSetToday')}`
            : `${staleRates.map((r) => r.name).join(', ')} — ${t('rate.staleWarning')}`,
      done: rates.length > 0 && staleRates.length === 0,
    },
    {
      href: `/moneylog?date=${date}`,
      label: t('dash.checkTheShifts'),
      detail:
        shifts.length === 0
          ? t('shift.noneToday')
          : outOfBalance.length === 0
            ? t('money.balances')
            : outOfBalance
                .map((s) => `${shiftLabel(t, s.name)} ${money(Math.abs(Number(s.difference)))}`)
                .join(' · '),
      done: shifts.length > 0 && outOfBalance.length === 0,
    },
    {
      href: `/day?date=${date}`,
      label: t('dash.countTheBox'),
      detail: counted
        ? `${money(day?.counted_cash ?? 0)} · ${t('day.difference')} ${money(cashDiff)}`
        : `${t('day.expectedCash')} ${money(day?.expected_cash ?? 0)}`,
      done: counted,
    },
    {
      href: `/day?date=${date}`,
      label: t('day.submit'),
      detail: approved
        ? t('day.approved')
        : handedOver
          ? t('day.withOwnerNow')
          : t('dash.notSentYet'),
      done: handedOver,
    },
  ]
  const left = mine.filter((s) => !s.done).length

  /* The forecourt's half: done or not done, never a task of hers. */
  const forecourt = [
    {
      label: t('shift.readings'),
      value: `${litres(day?.litres_sold ?? 0)} · ${money(day?.meter_sales ?? 0)}`,
      done: (day?.litres_sold ?? 0) > 0,
    },
    {
      label: t('credit.title'),
      value: `${slipCount} · ${money(day?.credit_sales ?? 0)}`,
      done: slipCount > 0,
    },
    {
      label: t('shift.cashHandedOver'),
      value: money(day?.collected_cash ?? 0),
      done: (day?.collected_cash ?? 0) > 0,
    },
  ]

  return (
    <>
      {setUpWarning}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>
            {left === 0 ? t('dash.allDoneToday') : `${left} ${t('dash.leftToday')}`}
          </Kicker>
          <h1 className="mt-1 text-[28px]">{formatDateLong(date)}</h1>
        </div>
        <div className="max-w-md">{verdict}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <div>
          <div className="mb-3">
            <Kicker>{t('dash.yoursToDoToday')}</Kicker>
          </div>
          <div className="flex flex-col gap-2">
            {mine.map((step, i) => (
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
                  <span className="block text-[14.5px] font-semibold">{step.label}</span>
                  <span className="tabular block text-[12px] text-neutral-700">
                    {step.detail}
                  </span>
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-5 rounded-[var(--radius-card)] bg-neutral-200 px-5 py-4">
            <Kicker>{t('dash.forecourtHasDone')}</Kicker>
            <div className="mt-3 flex flex-col gap-2.5">
              {forecourt.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span
                    className={`grid size-[22px] shrink-0 place-items-center rounded-full ${
                      f.done ? 'bg-accent-2 text-bg' : 'border-2 border-neutral-400'
                    }`}
                  >
                    {f.done ? <Check className="size-3" aria-hidden /> : null}
                  </span>
                  <span className="flex-1 text-[13.5px]">{f.label}</span>
                  <span className="tabular text-[13.5px] font-semibold">{f.value}</span>
                </div>
              ))}
            </div>
            <Link
              href={`/shifts?date=${date}`}
              className="mt-3 inline-block text-[12.5px] font-semibold text-accent"
            >
              {t('shift.title')} →
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div id="rates" className="scroll-mt-24">
            <TodaysRates rates={rates} />
          </div>
          {needsALook}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3">
          <Kicker>{t('dash.todaySales')}</Kicker>
        </div>
        {theChain}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href={`/moneylog?date=${date}`} icon={Receipt} label={t('nav.money')} />
        <QuickAction href={`/credit/new?date=${date}`} icon={Truck} label={t('credit.new')} />
        <QuickAction href={`/shifts?date=${date}`} icon={Fuel} label={t('shift.readings')} />
        <QuickAction href="/bank" icon={Banknote} label={t('bank.new')} />
      </div>

      {handedOver && !approved ? (
        <div className="mt-5">
          <Alert tone="accent">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-semibold">{t('day.withOwnerNow')}</span>
              <Link href={`/day?date=${date}`} className="font-semibold underline">
                {t('nav.day')} →
              </Link>
            </div>
          </Alert>
        </div>
      ) : null}
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
