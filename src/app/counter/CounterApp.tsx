'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowLeftRight, Check, Clock, Fuel, Lock, LogOut, Plus,
  TriangleAlert, UserRound,
} from 'lucide-react'
import { useLang, useT } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatDateLong, formatTime, money, quantity } from '@/lib/format'
import type {
  CreditSale, FuelType, NozzleState, Shift, ShiftCashDenomination, ShiftCollection,
  ShiftFiller, ShiftMeter, Staff, UserRole, Vehicle,
} from '@/lib/database.types'
import { LanguageSeg } from '@/components/AppNav'
import { Alert, Badge, Button, Field, Input, NumberInput, Select } from '@/components/ui'
import { rosterIncludes, SHIFTS, shiftHours, shiftLabel, type ShiftHours } from '@/lib/shifts'
import {
  addFillerToShift, counterSlip, finishShift, removeFillerFromShift,
  reopenShift as reopenShiftAction, saveCashCount, saveMeterReading,
  saveShiftPayments, startShift, updateSlip, type CounterResult,
} from './actions'

export interface CounterCustomer {
  id: string
  name: string
}

/** A shift with enough of its day on it to be chosen from a list. */
export interface ShiftDigest extends Shift {
  sold: number
  udhaar: number
  fillers: ShiftFiller[]
}

/**
 * Three tabs, because the device is used for three separate errands: the
 * shift itself (read the meters, see the hissab, count the cash, hand it in),
 * who is standing on it, and the udhaar written during it.
 */
type Tab = 'shift' | 'udhaar' | 'team'

type View =
  | 'home' | 'start' | 'meters' | 'slip' | 'cash' | 'finish' | 'switch' | 'signout'

const n = (v: string) => (v.trim() === '' ? 0 : Number(v))

/**
 * A nozzle that has put through more than this in one shift is unusual enough
 * to be worth a second look. It is a question and not a refusal: a busy
 * Diwali night really can do it, and a filler who is sure should be able to
 * say so and carry on. A wrong meter prices the whole shift, which is why it
 * is asked at all.
 */
const A_LOT_FOR_ONE_SHIFT = 3000

/**
 * India's coins and notes, largest first — the order a stack is actually
 * counted in, notes before coins are shaken out of a pocket last.
 */
const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1]

export function CounterApp({
  stationName,
  role,
  today,
  suggested,
  hours,
  staff,
  nozzles,
  fuels,
  customers,
  vehicles,
  shifts,
  shift,
  meters,
  now,
  opening,
  fillers,
  slips,
  collections,
  denominations,
  shiftMoney,
  hissab,
}: {
  stationName: string
  role: UserRole
  today: string
  /** the shift the clock says is due — an offer on the start sheet, never a choice */
  suggested: { name: string; order: number }
  /** when this pump changes over, which is a setting and not a constant */
  hours: ShiftHours
  staff: Staff[]
  nozzles: NozzleState[]
  fuels: FuelType[]
  customers: CounterCustomer[]
  vehicles: Vehicle[]
  /** today's shifts and yesterday's, for the bar and the picker */
  shifts: ShiftDigest[]
  /** the shift the device is on, or none — nothing runs until somebody starts it */
  shift: ShiftDigest | null
  /** every nozzle and CNG point, with what it read when the shift began */
  meters: ShiftMeter[]
  /** the server's clock, so a time on screen cannot differ from the one rendered */
  now: string
  /** which screen to land on, for a move that remounts this one */
  opening: 'home' | 'meters'
  fillers: ShiftFiller[]
  slips: CreditSale[]
  collections: ShiftCollection[]
  /** every filler's cash, by note and coin, for the shift being looked at */
  denominations: ShiftCashDenomination[]
  /** the shift's own card, UPI and BPCL totals — the shared machine, not any one filler */
  shiftMoney: { card: number; upi: number; bpcl: number }
  hissab: { sold: number; udhaar: number; cash: number; counted: number }
}) {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [view, setView] = useState<View>(opening)
  const [tab, setTab] = useState<Tab>('shift')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CreditSale | null>(null)

  /*
   * Where to land travelled in the address so it could survive moving shift.
   * It should not survive a reload as well, or a filler coming back to the
   * device an hour later opens the meter sheet instead of the shift.
   */
  useEffect(() => {
    if (opening === 'home') return
    const url = new URL(window.location.href)
    url.searchParams.delete('view')
    window.history.replaceState(null, '', url.toString())
  }, [opening])

  const nameOf = (s: { name: string; name_gu?: string | null }) =>
    (lang === 'gu' && s.name_gu) || s.name

  const locked = shift?.status === 'approved'
  const todays = shifts.filter((s) => s.business_date === today)
  const earlier = shifts.filter((s) => s.business_date !== today)

  /*
   * The shift being worked is the one somebody started and has not handed in.
   * Writing into another is legitimate — a slip written at 7.05 belongs to the
   * shift that has just gone — but it must never happen without the screen
   * saying so.
   */
  const runningNow =
    todays.filter((s) => s.status === 'open').pop() ??
    // A shift nobody finished last night is still the shift that is running.
    shifts.filter((s) => s.status === 'open').pop() ??
    null
  const elsewhere = Boolean(shift && runningNow && runningNow.id !== shift.id)

  function run<T extends CounterResult>(fn: () => Promise<T>, after?: (result: T) => void) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) setError(result.error)
      else {
        after?.(result)
        router.refresh()
      }
    })
  }

  /** Move the whole device onto another shift. Everything written follows it. */
  function goToShift(id: string) {
    setError(null)
    setView('home')
    setTab('shift')
    router.push(`/counter?shift=${id}`)
  }

  /* ------------------------------------------------------------ header -- */
  const header = (
    <header className="flex items-center gap-2.5 px-4 pt-3 pb-2">
      {/* min-w-0 or the truncate never fires: a flex item will not shrink past
          its content, so a long pump name pushes the language toggle off. */}
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-bg">
        <Fuel className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        {stationName}
      </div>
      <LanguageSeg compact />
      {/* There has to be a way off this screen, and it is a different way for
          each kind of person standing at it. The office is only visiting and
          goes back to its own pages; the forecourt is signed in as the pump
          and can only leave by signing the device out — which for a long time
          nothing on here offered, so a device signed in as the counter was
          stuck on the counter with no way to reach the login page at all. */}
      {role !== 'counter' ? (
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label={t('counter.backToOffice')}
          title={t('counter.backToOffice')}
          className="grid size-11 shrink-0 place-items-center rounded-2xl border border-divider"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      ) : view === 'signout' ? null : (
        <button
          type="button"
          onClick={() => setView('signout')}
          aria-label={t('auth.signOut')}
          title={t('auth.signOut')}
          className="grid size-11 shrink-0 place-items-center rounded-2xl border border-divider"
        >
          <LogOut className="size-5" aria-hidden />
        </button>
      )}
    </header>
  )

  /* -------------------------------------------------------- the pills -- */
  /* The day the device is on, which is not always today: a shift nobody
     finished last night is still the shift being worked, and a bar showing
     today's two would name neither of them. */
  const barDate = shift?.business_date ?? today
  const barShifts = shifts.filter((s) => s.business_date === barDate)

  const shiftBar = (
    <div className="flex items-stretch gap-2 px-4 pb-2.5">
      {SHIFTS.map((option) => {
        const it = barShifts.find((s) => s.name === option.name)
        const here = it && shift?.id === it.id
        return (
          <button
            key={option.name}
            type="button"
            disabled={pending || (!it && barDate !== today)}
            onClick={() =>
              it ? goToShift(it.id) : barDate === today ? setView('start') : undefined
            }
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2 text-left transition ${
              here
                ? 'border-2 border-accent bg-accent-200 text-accent-800'
                : it
                  ? 'border border-divider'
                  : 'border border-dashed border-neutral-400'
            }`}
          >
            <ShiftDot shift={it} />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">{t(option.key)}</span>
              <span
                className={`block truncate text-[11.5px] ${
                  here ? 'font-semibold' : 'text-neutral-700'
                }`}
              >
                {!it
                  ? t('counter.shiftNotOpen')
                  : it.status === 'open'
                    ? t('counter.running')
                    : it.status === 'approved'
                      ? t('counter.shiftApproved')
                      : t('counter.handedIn')}
              </span>
            </span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => setView('switch')}
        aria-label={t('counter.whichShiftQ')}
        className="grid w-12 shrink-0 place-items-center rounded-2xl border border-divider text-neutral-700"
      >
        <ArrowLeftRight className="size-5" aria-hidden />
      </button>
    </div>
  )

  /* ---------------------------------------------------------- the tabs -- */
  const bottomNav = (
    <nav className="flex border-t border-divider bg-surface px-1.5 pt-1.5 pb-3">
      {([
        ['shift', t('counter.tabShift'), null],
        ['udhaar', t('counter.tabUdhaar'), slips.length || null],
        ['team', t('counter.tabFillers'), null],
      ] as const).map(([key, label, badge]) => (
        <button
          key={key}
          type="button"
          disabled={!shift}
          // The slip count is read out with the name otherwise, and "2 Udhaar"
          // is not what this button is called.
          aria-label={label}
          aria-current={tab === key && view === 'home'}
          onClick={() => {
            setTab(key)
            setView('home')
          }}
          className={`flex flex-1 flex-col items-center gap-1 py-2 text-[12.5px] transition ${
            !shift
              ? 'text-neutral-400'
              : tab === key && view === 'home'
                ? 'font-bold text-accent-700'
                : 'font-semibold text-neutral-700'
          }`}
        >
          <span className="relative">
            <TabIcon which={key} />
            {badge ? (
              <span
                aria-hidden
                className="tabular absolute -top-1.5 -right-3 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-danger px-1.5 text-[11.5px] font-bold text-bg"
              >
                {badge}
              </span>
            ) : null}
          </span>
          {label}
        </button>
      ))}
    </nav>
  )

  const banner = error ? (
    <div className="px-4 pb-3">
      <Alert tone="danger">{error}</Alert>
    </div>
  ) : null

  /* ------------------------------------------------------ the screens -- */
  let screen: React.ReactNode = null

  if (view === 'start') {
    screen = (
      <StartSheet
        today={today}
        suggested={suggested}
        now={now}
        hours={hours}
        shifts={todays}
        staff={staff}
        pending={pending}
        nameOf={nameOf}
        onBack={() => setView('home')}
        onStart={(name, staffId, fillerIds) =>
          run(
            () => startShift({ name, date: today, staffId, fillerIds }),
            // Onto the shift that was actually opened. Without naming it the
            // device would stay pinned to whatever ?shift= was last picked.
            // Nothing about the meters needs doing here any more — a new
            // shift already opens on whatever the last one closed at.
            ({ id }) => {
              setView('home')
              router.replace(id ? `/counter?shift=${id}` : '/counter')
            },
          )
        }
      />
    )
  } else if (view === 'signout') {
    screen = <SignOutSheet onBack={() => setView('home')} />
  } else if (view === 'switch') {
    screen = (
      <SwitchSheet
        today={today}
        hours={hours}
        current={shift}
        todays={todays}
        earlier={earlier}
        nameOf={nameOf}
        onBack={() => setView('home')}
        onPick={goToShift}
        onStart={() => setView('start')}
      />
    )
  } else if (!shift) {
    screen = (
      <Resting
        suggested={suggested}
        now={now}
        hours={hours}
        shifts={todays}
        onStart={() => setView('start')}
        onSee={goToShift}
      />
    )
  } else if (view === 'meters') {
    screen = (
      <MeterSheet
        meters={meters}
        locked={Boolean(locked)}
        pending={pending}
        onBack={() => setView('home')}
        onSave={(nozzleRows, cngRows) =>
          run(
            () => saveMeterReading(shift.id, nozzleRows, cngRows),
            () => setView('home'),
          )
        }
      />
    )
  } else if (view === 'slip') {
    screen = (
      <SlipForm
        shift={shift}
        slip={editing}
        customers={customers}
        vehicles={vehicles}
        fuels={fuels}
        nozzles={nozzles}
        fillers={fillers}
        staff={staff}
        nameOf={nameOf}
        pending={pending}
        onBack={() => {
          setEditing(null)
          setView('home')
        }}
        onSubmit={(payload, id) =>
          run(
            () =>
              id
                ? updateSlip(id, {
                    customer_id: payload.customer_id,
                    vehicle_id: payload.vehicle_id,
                    fuel_type_id: payload.fuel_type_id,
                    quantity: payload.quantity,
                    sale_rate: payload.sale_rate,
                    slip_number: payload.slip_number,
                    driver_name: payload.driver_name,
                    staff_id: payload.staff_id,
                  })
                : counterSlip(payload),
            () => {
              setEditing(null)
              setTab('udhaar')
              setView('home')
            },
          )
        }
      />
    )
  } else if (view === 'cash') {
    screen = (
      <CashSheet
        fillers={fillers}
        collections={collections}
        denominations={denominations}
        // sold less udhaar — what's owed across cash, card, UPI and BPCL
        // together. The card/UPI/BPCL boxes below subtract themselves out of
        // this, live, to arrive at what's left for the cash box specifically.
        owed={hissab.sold - hissab.udhaar}
        shiftMoney={shiftMoney}
        locked={Boolean(locked)}
        pending={pending}
        nameOf={nameOf}
        onBack={() => setView('home')}
        onSave={(counts, payments) =>
          run(
            () =>
              Promise.all([
                saveCashCount(shift.id, counts),
                saveShiftPayments(shift.id, payments),
              ]).then(([a, b]) => (a.error ? a : b.error ? b : { ok: true })),
            () => setView('home'),
          )
        }
      />
    )
  } else if (view === 'finish') {
    screen = (
      <FinishSheet
        shift={shift}
        hours={hours}
        meters={meters}
        slips={slips}
        fillers={fillers}
        staff={staff}
        hissab={hissab}
        pending={pending}
        nameOf={nameOf}
        onBack={() => setView('home')}
        onFinish={(staffId) =>
          run(
            () => finishShift(shift.id, staffId),
            () => setView('home'),
          )
        }
      />
    )
  } else if (tab === 'udhaar') {
    screen = (
      <SlipList
        slips={slips}
        customers={customers}
        fuels={fuels}
        staff={staff}
        shift={shift}
        hours={hours}
        locked={Boolean(locked)}
        nameOf={nameOf}
        canWrite={shift.business_date === today && !locked}
        onWrite={() => {
          setEditing(null)
          setView('slip')
        }}
        onFix={(slip) => {
          setEditing(slip)
          setView('slip')
        }}
      />
    )
  } else if (tab === 'team') {
    screen = (
      <FillerList
        fillers={fillers}
        staff={staff}
        locked={Boolean(locked)}
        pending={pending}
        nameOf={nameOf}
        onAdd={(staffId) => run(() => addFillerToShift(shift.id, staffId))}
        onRemove={(staffId) => run(() => removeFillerFromShift(shift.id, staffId))}
      />
    )
  } else {
    screen = (
      <ShiftHome
        shift={shift}
        hours={hours}
        today={today}
        elsewhere={elsewhere}
        meters={meters}
        slips={slips}
        collections={collections}
        hissab={hissab}
        pending={pending}
        onGo={setView}
        onBackToRunning={() => runningNow && goToShift(runningNow.id)}
        onReopen={() => run(() => reopenShiftAction(shift.id))}
        onNewSlip={() => {
          setEditing(null)
          setView('slip')
        }}
        onSeeSlips={() => setTab('udhaar')}
      />
    )
  }

  /* The start sheet and the picker are whole-screen errands, so the tabs and
     the pills step out of the way. Resting keeps the tabs — greyed, because
     there is nothing to put in them yet — so the device does not look like a
     different app between shifts. */
  const sheet = view === 'start' || view === 'switch' || view === 'signout'

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      {sheet || !shift ? null : shiftBar}
      {banner}
      <main className="mx-auto w-full max-w-2xl flex-1">{screen}</main>
      {sheet ? null : bottomNav}
    </div>
  )
}

/**
 * Handing the device back.
 *
 * A forecourt device stays signed in as the pump on purpose — a filler should
 * never meet a password between a lorry and a slip — so this is not something
 * to be tripped over: it is a screen of its own, it says plainly that nothing
 * is lost, and it warns that getting back in needs the office. What it must
 * not be is missing, which it was: signed in as the counter there was no way
 * to the login page short of clearing the browser.
 */
function SignOutSheet({ onBack }: { onBack: () => void }) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <div className="pb-6">
      <Head title={t('counter.signOutQ')} onBack={onBack} />

      <div className="px-4">
        <div className="rounded-[26px] bg-surface px-4.5 py-4">
          <p className="text-[15px] leading-relaxed text-neutral-800">
            {t('counter.signOutWhat')}
          </p>
          <p className="mt-3 flex items-start gap-2.5 text-[14px] leading-relaxed text-accent-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('counter.signOutWarn')}
          </p>
        </div>

        <Button
          size="lg"
          variant="danger"
          className="mt-4 w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await createClient().auth.signOut()
            router.push('/login')
            router.refresh()
          }}
        >
          {busy ? t('common.saving') : t('auth.signOut')}
        </Button>

        <button
          type="button"
          onClick={onBack}
          className="mt-2.5 w-full rounded-[22px] px-4 py-3.5 text-[17px] font-semibold text-neutral-800"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- bits -- */

function TabIcon({ which }: { which: Tab }) {
  if (which === 'shift') return <Fuel className="size-[22px]" aria-hidden />
  if (which === 'team') return <UserRound className="size-[22px]" aria-hidden />
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[22px]"
      aria-hidden
    >
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}

function ShiftDot({ shift }: { shift: Shift | undefined }) {
  if (!shift) {
    return (
      <span className="size-[22px] shrink-0 rounded-full border-2 border-dashed border-neutral-400" />
    )
  }
  if (shift.status === 'open') {
    return <span className="size-2.5 shrink-0 rounded-full bg-danger" />
  }
  return (
    <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent-2 text-bg">
      {shift.status === 'approved' ? (
        <Lock className="size-3" aria-hidden />
      ) : (
        <Check className="size-3.5" strokeWidth={3.5} aria-hidden />
      )}
    </span>
  )
}

function Head({
  title,
  sub,
  onBack,
}: {
  title: string
  sub?: string
  onBack?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-1 pb-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[22px]">{title}</h1>
        {sub ? <div className="mt-0.5 text-[13px] text-neutral-700">{sub}</div> : null}
      </div>
    </div>
  )
}

function Kick({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-bold tracking-[0.09em] text-neutral-700 uppercase">
      {children}
    </div>
  )
}

/* ------------------------------------------------------------ resting -- */
/**
 * Nothing is running.
 *
 * The device used to read the clock and put itself on whichever shift was due,
 * so a night nobody had started still looked like a night in progress. It now
 * says plainly that no shift is running, and the clock is demoted to the hint
 * it always was.
 */
function Resting({
  suggested,
  now,
  hours,
  shifts,
  onStart,
  onSee,
}: {
  suggested: { name: string; order: number }
  now: string
  hours: ShiftHours
  shifts: ShiftDigest[]
  onStart: () => void
  onSee: (id: string) => void
}) {
  const t = useT()
  const last = shifts.filter((s) => s.status !== 'open').pop()

  return (
    <div className="px-4 pb-6">
      <div className="rounded-[var(--radius-card)] bg-surface px-6 py-7 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full border-2 border-dashed border-neutral-400 text-neutral-700">
          <Clock className="size-7" aria-hidden />
        </span>
        <h1 className="mt-3.5 text-[30px]">{t('counter.noShift')}</h1>
        <p className="mt-2 text-[14.5px] text-neutral-800">{t('counter.noShiftWhy')}</p>
        <div className="mt-4.5 pt-1">
          <Button size="lg" className="w-full" onClick={onStart}>
            {t('counter.startAShift')}
          </Button>
        </div>
        <p className="tabular mt-3 text-[13px] text-neutral-700">
          {formatTime(now)} — {shiftLabel(t, suggested.name)} {t('counter.clockHintA')}{' '}
          {t('counter.clockHintB')}
        </p>
      </div>

      {last ? (
        <button
          type="button"
          onClick={() => onSee(last.id)}
          className="mt-3 flex w-full items-center gap-3 rounded-3xl bg-accent-2-200 px-4 py-3.5 text-left"
        >
          <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-accent-2 text-bg">
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-accent-2-900">
              {shiftLabel(t, last.name)} — {t('counter.handedIn')}
            </span>
            <span className="tabular block text-[12.5px] text-accent-2-800">
              {formatTime(last.closed_at)} · {shiftHours(last.name, hours)}
            </span>
          </span>
        </button>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------- start -- */
/**
 * Somebody starts the shift.
 *
 * Three things in the order the forecourt does them: which shift this is, what
 * will be written down, and who is standing here. The last one belongs at the
 * start because 6.55am is when it is known, and the office's roster is only a
 * guess at it.
 */
function StartSheet({
  today,
  suggested,
  now,
  hours,
  shifts,
  staff,
  pending,
  nameOf,
  onBack,
  onStart,
}: {
  today: string
  suggested: { name: string; order: number }
  now: string
  hours: ShiftHours
  shifts: ShiftDigest[]
  staff: Staff[]
  pending: boolean
  nameOf: (s: { name: string; name_gu?: string | null }) => string
  onBack: () => void
  onStart: (name: string, staffId: string | null, fillerIds: string[]) => void
}) {
  const t = useT()
  const [name, setName] = useState(suggested.name)
  const [picked, setPicked] = useState<string[]>(() =>
    staff.filter((s) => rosterIncludes(s, suggested.name, today)).map((s) => s.id),
  )

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  /** The shift of that name already on the books for today, if there is one. */
  const chosen = shifts.find((s) => s.name === name)

  return (
    <div className="pb-6">
      <Head title={t('counter.startAShift')} onBack={onBack} />

      <div className="px-4">
        <div className="mb-2 text-[14px] font-bold text-neutral-800">
          {t('counter.whichShift')}
        </div>
        <div className="flex gap-2.5">
          {SHIFTS.map((option) => {
            const already = shifts.find((s) => s.name === option.name)
            const on = name === option.name
            return (
              <button
                key={option.name}
                type="button"
                onClick={() => {
                  setName(option.name)
                  setPicked(
                    staff.filter((s) => rosterIncludes(s, option.name, today)).map((s) => s.id),
                  )
                }}
                className={`flex-1 rounded-[20px] px-3.5 py-3 text-left transition ${
                  on
                    ? 'border-2 border-accent bg-accent-200 text-accent-800'
                    : 'border border-divider text-neutral-800'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[17px] font-bold">
                  {t(option.key)}
                  {on ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
                </span>
                <span className="tabular mt-0.5 block text-[12.5px]">
                  {shiftHours(option.name, hours)}
                </span>
                <span className="mt-1 block text-[12px] text-neutral-700">
                  {already
                    ? already.status === 'open'
                      ? t('counter.running')
                      : t('counter.alreadyHandedIn')
                    : t('counter.notStartedYet')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3.5 px-4">
        <div className="flex items-start gap-3 rounded-[20px] bg-surface px-4 py-3.5">
          <Clock className="mt-0.5 size-5 shrink-0 text-neutral-700" aria-hidden />
          <p className="text-[13.5px] leading-snug text-neutral-800">
            {t('counter.willBeWritten')}{' '}
            <strong>
              {shiftLabel(t, name)}, {formatDateLong(today)}
            </strong>
            , {t('counter.startedAt')}{' '}
            <span className="tabular">{formatTime(now)}</span> —{' '}
            {t('counter.pressNotSeven')}
          </p>
        </div>
      </div>

      <div className="mt-3.5 px-4">
        <div className="rounded-[var(--radius-card)] bg-surface px-4.5 py-4">
          <div className="text-[15px] font-bold">{t('counter.whoIsOnIt')}</div>
          <p className="mt-0.5 text-[13px] text-neutral-700">{t('counter.whoIsOnHint')}</p>
          {staff.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-neutral-700">{t('counter.nobodyOn')}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {staff.map((s) => {
                const on = picked.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={on}
                    aria-label={nameOf(s)}
                    className={`inline-flex items-center gap-2 rounded-full py-2 pr-4 pl-2 text-[15px] transition ${
                      on
                        ? 'bg-accent-700 font-bold text-bg'
                        : 'border border-divider font-semibold'
                    }`}
                  >
                    <span
                      className={`grid size-[26px] place-items-center rounded-full text-[12.5px] font-bold ${
                        on ? 'bg-bg text-accent-800' : 'bg-neutral-300 text-neutral-800'
                      }`}
                    >
                      {on ? (
                        <Check className="size-3.5" strokeWidth={3.2} aria-hidden />
                      ) : (
                        nameOf(s).slice(0, 1)
                      )}
                    </span>
                    {nameOf(s)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <p className="mt-3.5 px-5 text-[13px] leading-relaxed text-neutral-700">
        {t('counter.anyoneCanStart')}
      </p>

      <div className="mt-4 px-4">
        <Button
          size="lg"
          className="w-full"
          disabled={pending || chosen?.status === 'approved'}
          onClick={() => onStart(name, picked[0] ?? null, picked)}
        >
          {pending
            ? t('common.saving')
            : `${
                chosen?.status === 'submitted'
                  ? t('counter.startAgain')
                  : t('counter.startShift')
              } — ${shiftLabel(t, name)}`}
        </Button>
        <p className="mt-2.5 text-center text-[13px] text-neutral-700">
          {chosen?.status === 'approved'
            ? t('counter.lockedByOffice')
            : chosen?.status === 'submitted'
              ? t('counter.startAgainWhy')
              : t('counter.thenWalk')}
        </p>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- home -- */
function ShiftHome({
  shift,
  hours,
  today,
  elsewhere,
  meters,
  slips,
  collections,
  hissab,
  pending,
  onGo,
  onBackToRunning,
  onReopen,
  onNewSlip,
  onSeeSlips,
}: {
  shift: ShiftDigest
  hours: ShiftHours
  today: string
  /** the device is on a shift other than the one being worked */
  elsewhere: boolean
  meters: ShiftMeter[]
  slips: CreditSale[]
  collections: ShiftCollection[]
  hissab: { sold: number; udhaar: number; cash: number; counted: number }
  pending: boolean
  onGo: (view: View) => void
  onBackToRunning: () => void
  onReopen: () => void
  onNewSlip: () => void
  onSeeSlips: () => void
}) {
  const t = useT()
  // Inherited is not the same as closed: a fresh shift opens with numbers
  // copied from whoever went before, and that alone should not read as
  // "done" — nobody at this pump has actually looked at a meter yet.
  const closed = meters.some((m) => m.confirmed)
  const counted = collections.length > 0
  const open = shift.status === 'open'

  return (
    <div className="px-4 pb-4">
      {elsewhere ? (
        <button
          type="button"
          onClick={onBackToRunning}
          className="mb-2.5 flex w-full items-center gap-3 rounded-[18px] border border-danger-200 bg-danger-100 px-4 py-3 text-left"
        >
          <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden />
          <span className="text-[13.5px] leading-snug">
            {t('counter.notThisShift')} <strong>{shiftLabel(t, shift.name)}</strong>.{' '}
            <span className="font-semibold underline">{t('counter.backToRunning')}</span>
          </span>
        </button>
      ) : null}

      <div
        className={`flex items-center gap-3 rounded-[22px] px-4.5 py-3.5 text-bg ${
          open ? 'bg-accent-700' : 'bg-accent-2-700'
        }`}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] leading-tight">{shiftLabel(t, shift.name)}</h1>
          <div className="tabular mt-1 truncate text-[13px] opacity-85">
            {shift.business_date === today ? '' : `${formatDate(shift.business_date)} · `}
            {shiftHours(shift.name, hours)}
            {shift.opened_at ? ` · ${t('counter.started')} ${formatTime(shift.opened_at)}` : ''}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-bg px-3 py-1.5 text-[13px] font-bold text-accent-800">
          {shift.status === 'approved'
            ? t('shift.approved')
            : shift.status === 'submitted'
              ? t('counter.handedIn')
              : t('counter.running')}
        </span>
      </div>

      <div className="mt-2.5 rounded-[26px] bg-surface px-4.5 pt-4 pb-3.5">
        <Kick>{t('counter.hissab')}</Kick>
        <div className="mt-2.5 flex items-baseline justify-between">
          <span className="text-[15px] text-neutral-800">{t('counter.wentOut')}</span>
          <span className="tabular text-[18px] font-semibold">{money(hissab.sold)}</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[15px] text-neutral-800">{t('counter.onUdhaar')}</span>
          <span className="tabular text-[18px] font-semibold">− {money(hissab.udhaar)}</span>
        </div>
        <div className="my-3 h-px bg-neutral-400" />
        <div className="flex items-end justify-between gap-2.5">
          <span className="pb-1 text-[15px] font-semibold">{t('counter.cashDue')}</span>
          <span className="tabular text-[36px] leading-none font-bold text-accent-2-800">
            {money(hissab.cash)}
          </span>
        </div>
      </div>

      <div className="mt-2.5 rounded-[26px] bg-surface px-4.5 pt-2.5 pb-2">
        <div className="pt-1.5">
          <Kick>{shift.status === 'open' ? t('counter.whatIsLeft') : t('counter.stillYours')}</Kick>
        </div>

        <Step
          done={closed}
          n={1}
          title={closed ? t('counter.metersRead') : t('counter.metersNotRead')}
          sub={
            closed
              ? `${meters.filter((m) => m.confirmed).length}`
              : t('counter.walkSub')
          }
          onClick={() => onGo('meters')}
        />
        <Step
          done={slips.length > 0}
          n={2}
          title={
            slips.length === 0
              ? t('counter.noSlipsYet')
              : `${slips.length} ${
                  slips.length === 1 ? t('counter.slipWritten') : t('counter.slipsWritten')
                }`
          }
          sub={slips.length > 0 ? money(hissab.udhaar) : t('counter.udhaarHint')}
          onClick={onSeeSlips}
        />
        <Step
          done={counted}
          n={3}
          title={counted ? t('counter.cashCounted') : t('counter.cashNotCounted')}
          sub={counted ? money(hissab.counted) : t('counter.countBeforeFinish')}
          urgent={!counted}
          onClick={() => onGo('cash')}
        />
        <Step
          done={shift.status !== 'open'}
          n={4}
          last
          title={open ? t('counter.finishStep') : t('counter.shiftClosed')}
          sub={shift.closed_at ? formatTime(shift.closed_at) : undefined}
          onClick={() => onGo('finish')}
        />
      </div>

      <div className="mt-3">
        {open && shift.business_date === today ? (
          <Button size="lg" className="w-full" onClick={onNewSlip}>
            <Plus className="size-5" aria-hidden />
            {t('counter.newSlip')}
          </Button>
        ) : shift.status === 'submitted' ? (
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={onReopen}
          >
            {t('counter.reopenShift')}
          </Button>
        ) : (
          <Alert tone="accent">{t('counter.lockedByOffice')}</Alert>
        )}
      </div>

      {shift.status === 'submitted' ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-neutral-700">
          {t('counter.canStillFix')}
        </p>
      ) : null}
    </div>
  )
}

function Step({
  done,
  n: index,
  title,
  sub,
  urgent,
  last,
  onClick,
}: {
  done: boolean
  n: number
  title: string
  sub?: string
  urgent?: boolean
  last?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 py-2.5 text-left ${
        last ? '' : 'border-b border-neutral-300'
      }`}
    >
      <span
        className={`grid size-[26px] shrink-0 place-items-center rounded-full text-[13px] font-bold ${
          done
            ? 'bg-accent-2 text-bg'
            : urgent
              ? 'border-2 border-accent text-accent-700'
              : 'border-2 border-neutral-400 text-neutral-700'
        }`}
      >
        {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-semibold">{title}</span>
        {sub ? (
          <span
            className={`tabular block truncate text-[12.5px] ${
              urgent ? 'font-semibold text-accent-700' : 'text-neutral-700'
            }`}
          >
            {sub}
          </span>
        ) : null}
      </span>
      <ArrowLeft className="size-4 shrink-0 rotate-180 text-neutral-600" aria-hidden />
    </button>
  )
}

/* ----------------------------------------------------- the meter walk -- */
/**
 * Every nozzle on the forecourt, one box each.
 *
 * This is the walk whoever is finishing the shift does, before they go: the
 * pumps in order, then the CNG island. One number per meter — what it says
 * now — becomes this shift's own closing. Nothing here touches any other
 * shift; the one that starts next simply opens on whatever this one closes
 * at, the moment it is started. What it shows back is the difference since
 * this shift's own opening, because that is the figure a filler can check by
 * eye, and a mistyped meter prices the whole shift.
 */
function MeterSheet({
  meters,
  locked,
  pending,
  onBack,
  onSave,
}: {
  meters: ShiftMeter[]
  locked: boolean
  pending: boolean
  onBack: () => void
  onSave: (
    nozzles: { nozzle_id: string; reading: string }[],
    cng: { dispenser_id: string; reading: string }[],
  ) => void
}) {
  const t = useT()
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      meters.map((m) => [
        m.meter_id,
        m.closing_reading != null ? String(m.closing_reading) : '',
      ]),
    ),
  )

  /* What this meter read when the shift began — inherited from whatever the
     shift before it last closed at, or, on the pump's very first shift (or a
     nozzle with no history yet), nothing at all. */
  const before = (m: ShiftMeter) =>
    m.opening_reading != null ? Number(m.opening_reading) : null

  /* What has gone through the nozzle since — the figure a filler can check by
     eye, and the reason a mistyped digit is caught here rather than in the
     office a week later. */
  const deltaOf = (m: ShiftMeter) => {
    const typed = (v[m.meter_id] ?? '').trim()
    const mark = before(m)
    if (typed === '' || mark == null) return null
    return Number(typed) - mark
  }

  // Live only when a number has actually changed. A Save button that is lit
  // with nothing to save invites people to press it and wonder whether
  // anything happened.
  const dirty = meters.some((m) => {
    const now = (v[m.meter_id] ?? '').trim()
    const had = m.closing_reading != null ? String(m.closing_reading) : ''
    return now !== '' && now !== had
  })
  /* Named, not just counted: "a meter cannot go backwards" with five boxes on
     screen and no clue which one is a puzzle, and the Save button is asleep
     until it is solved. */
  const backwards = meters.filter((m) => (deltaOf(m) ?? 0) < 0)
  const unusual = meters.filter((m) => (deltaOf(m) ?? 0) > A_LOT_FOR_ONE_SHIFT)
  const list = (rows: ShiftMeter[]) => rows.map((m) => m.name).join(', ')

  return (
    <div className="pb-6">
      <Head title={t('counter.walkTitle')} sub={t('counter.walkSub')} onBack={onBack} />

      <div className="px-4">
        <div className="rounded-[var(--radius-card)] bg-surface px-4.5 pt-1 pb-4">
          {meters.map((m, i) => {
            const delta = deltaOf(m)
            return (
              <div
                key={m.meter_id}
                className={`py-3 ${i === meters.length - 1 ? '' : 'border-b border-neutral-300'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold">{m.name}</div>
                    <div className="tabular text-[12.5px] text-neutral-700">
                      {m.fuel_name}
                      {before(m) != null
                        ? ` · ${t('counter.meterWas')} ${before(m)!.toFixed(2)}`
                        : ''}
                    </div>
                  </div>
                  <div className="w-[9.5rem] shrink-0">
                    <NumberInput
                      step="0.001"
                      disabled={locked}
                      aria-label={`${t('counter.meterNow')} — ${m.name}`}
                      className="py-3 text-right text-[22px] font-bold"
                      value={v[m.meter_id] ?? ''}
                      onChange={(e) =>
                        setV((prev) => ({ ...prev, [m.meter_id]: e.target.value }))
                      }
                    />
                  </div>
                </div>
                {delta != null && delta !== 0 ? (
                  <div
                    className={`mt-2 flex items-center justify-between rounded-2xl px-3.5 py-2 ${
                      delta < 0
                        ? 'bg-danger-100 text-danger'
                        : 'bg-accent-2-200 text-accent-2-900'
                    }`}
                  >
                    <span className="text-[13.5px]">{t('counter.sinceLast')}</span>
                    <span className="tabular text-[17px] font-bold">
                      {quantity(delta, m.unit)}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {backwards.length > 0 ? (
          <div className="mt-3">
            <Alert tone="danger">
              <strong>{list(backwards)}</strong> — {t('counter.meterBackwards')}
            </Alert>
          </div>
        ) : unusual.length > 0 ? (
          <div className="mt-3">
            <Alert tone="accent">
              <strong>{list(unusual)}</strong> — {t('counter.meterUnusual')}
            </Alert>
          </div>
        ) : null}

        <p className="mt-3 px-1 text-[13px] leading-relaxed text-neutral-700">
          {t('counter.meterHint')}
        </p>

        <div className="mt-3">
          <Button
            size="lg"
            className="w-full"
            disabled={pending || !dirty || backwards.length > 0 || locked}
            onClick={() =>
              onSave(
                meters
                  .filter((m) => m.kind === 'nozzle')
                  .map((m) => ({ nozzle_id: m.meter_id, reading: v[m.meter_id] ?? '' })),
                meters
                  .filter((m) => m.kind === 'cng')
                  .map((m) => ({ dispenser_id: m.meter_id, reading: v[m.meter_id] ?? '' })),
              )
            }
          >
            {pending ? t('common.saving') : t('counter.saveReading')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- the slips -- */
function SlipList({
  slips,
  customers,
  fuels,
  staff,
  shift,
  hours,
  locked,
  canWrite,
  nameOf,
  onWrite,
  onFix,
}: {
  slips: CreditSale[]
  customers: CounterCustomer[]
  fuels: FuelType[]
  staff: Staff[]
  shift: ShiftDigest
  hours: ShiftHours
  locked: boolean
  /** a new slip belongs to the working day, so an older shift only gets fixes */
  canWrite: boolean
  nameOf: (s: { name: string; name_gu?: string | null }) => string
  onWrite: () => void
  onFix: (slip: CreditSale) => void
}) {
  const t = useT()
  const total = slips.reduce((sum, s) => sum + Number(s.amount), 0)
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—'
  const fuelOf = (id: string) => fuels.find((f) => f.id === id)
  const servedBy = (id: string | null) => {
    const who = staff.find((s) => s.id === id)
    return who ? nameOf(who) : null
  }

  return (
    <div className="px-4 pb-4">
      <div className="pt-1 pb-3">
        <h1 className="text-[24px]">{t('counter.udhaarTitle')}</h1>
        <div className="tabular mt-1 text-[14px] text-neutral-700">
          {shiftLabel(t, shift.name)} · {shiftHours(shift.name, hours)} · {slips.length} ·{' '}
          {money(total)}
        </div>
      </div>

      {canWrite ? (
        <Button size="lg" className="mb-3 w-full" onClick={onWrite}>
          <Plus className="size-5" aria-hidden />
          {t('counter.writeSlip')}
        </Button>
      ) : locked ? null : (
        <div className="mb-3">
          <Alert tone="accent">{t('counter.olderShift')}</Alert>
        </div>
      )}

      <div className="rounded-[var(--radius-card)] bg-surface px-4.5 py-1">
        {slips.length === 0 ? (
          <p className="py-5 text-center text-[14px] text-neutral-700">
            {t('counter.noSlipsYet')}
          </p>
        ) : (
          slips.map((slip, i) => {
            const fuel = fuelOf(slip.fuel_type_id)
            const who = servedBy(slip.staff_id)
            return (
              <div
                key={slip.id}
                className={`flex gap-3 py-3.5 ${
                  i === slips.length - 1 ? '' : 'border-b border-neutral-300'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-semibold">
                    {customerName(slip.customer_id)}
                  </div>
                  <div className="tabular mt-0.5 truncate text-[13px] text-neutral-700">
                    {slip.vehicle_number ? `${slip.vehicle_number} · ` : ''}
                    {quantity(slip.quantity, fuel?.unit ?? 'L')}
                    {fuel ? ` ${fuel.name}` : ''}
                  </div>
                  <div className="tabular mt-0.5 truncate text-[13px] text-neutral-700">
                    {formatTime(slip.created_at)}
                    {who ? ` · ${who}` : ''}
                    {/* A bare slip number sat where the filler's name goes and
                        read like one. */}
                    {slip.slip_number ? ` · #${slip.slip_number}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular text-[19px] font-bold">{money(slip.amount)}</div>
                  {locked || slip.invoice_id ? null : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-1.5"
                      onClick={() => onFix(slip)}
                    >
                      {t('counter.fix')}
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <p className="mt-3 px-1 text-[13px] leading-relaxed text-neutral-700">
        {t('counter.noBalanceHere')}
      </p>
    </div>
  )
}

/* ----------------------------------------------------------- the slip -- */
function SlipForm({
  shift,
  slip,
  customers,
  vehicles,
  fuels,
  nozzles,
  fillers,
  staff,
  nameOf,
  pending,
  onBack,
  onSubmit,
}: {
  shift: ShiftDigest
  /** the slip being put right, or none for a new one */
  slip: CreditSale | null
  customers: CounterCustomer[]
  vehicles: Vehicle[]
  fuels: FuelType[]
  nozzles: NozzleState[]
  fillers: ShiftFiller[]
  staff: Staff[]
  nameOf: (s: { name: string; name_gu?: string | null }) => string
  pending: boolean
  onBack: () => void
  onSubmit: (payload: Parameters<typeof counterSlip>[0], id?: string) => void
}) {
  const t = useT()

  // Default to a fuel that actually has a price; one without a rate cannot be
  // sold and would only produce an error after everything had been typed.
  const priced = fuels.filter((f) =>
    nozzles.some((z) => z.fuel_type_id === f.id && Number(z.sale_rate) > 0),
  )

  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState(slip?.customer_id ?? '')
  const [vehicleId, setVehicleId] = useState(slip?.vehicle_id ?? '')
  const [fuelId, setFuelId] = useState(
    slip?.fuel_type_id ?? (priced[0] ?? fuels[0])?.id ?? '',
  )
  const [nozzleId, setNozzleId] = useState(slip?.nozzle_id ?? '')
  const [litres, setLitres] = useState(slip ? String(slip.quantity) : '')
  const [amount, setAmount] = useState(slip ? String(slip.amount) : '')
  const [slipNo, setSlipNo] = useState(slip?.slip_number ?? '')
  const [driver, setDriver] = useState(slip?.driver_name ?? '')
  const [more, setMore] = useState(false)
  const [servedBy, setServedBy] = useState<string | null>(slip?.staff_id ?? null)

  // The rate on a slip being corrected is the rate it was written at: a price
  // that moved since must not quietly reprice yesterday's fuel.
  const rate = useMemo(() => {
    if (slip && slip.fuel_type_id === fuelId) return Number(slip.sale_rate)
    return Number(nozzles.find((z) => z.fuel_type_id === fuelId)?.sale_rate ?? 0)
  }, [fuelId, nozzles, slip])

  const chosen = customers.find((c) => c.id === customerId)
  const matches = search.trim()
    ? customers
        .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
        .slice(0, 6)
    : []
  const theirVehicles = vehicles.filter((v) => v.customer_id === customerId)
  // Whoever is standing on this shift. The office's whole staff list is not
  // the question — it is who served this lorry, a minute ago, here.
  const serving = fillers.length > 0 ? fillers : staff.map((s) => ({ ...s, staff_id: s.id }))

  return (
    <div className="pb-6">
      <div className="flex items-center gap-3 px-4 pt-1 pb-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="flex-1 text-[22px]">{t('counter.newSlip')}</h1>
        <Badge tone="accent">{shiftLabel(t, shift.name)}</Badge>
      </div>

      <div className="flex flex-col gap-3.5 px-4">
        <div>
          <label
            htmlFor="counter-customer"
            className="mb-1.5 block text-[14px] font-bold text-neutral-800"
          >
            {t('counter.whoIsTaking')}
          </label>
          {chosen ? (
            <div className="flex items-center gap-2.5 rounded-[20px] border-2 border-accent bg-neutral-100 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[19px] font-semibold">
                {chosen.name}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCustomerId('')
                  setVehicleId('')
                  setSearch('')
                }}
              >
                {t('common.change')}
              </Button>
            </div>
          ) : (
            <>
              <Input
                id="counter-customer"
                value={search}
                autoComplete="off"
                disabled={customers.length === 0}
                placeholder={
                  customers.length === 0
                    ? t('counter.noCustomersYet')
                    : t('counter.searchCustomer')
                }
                className="py-3.5 text-[17px]"
                onChange={(e) => setSearch(e.target.value)}
              />
              {/* Silence here used to mean two different things — nothing
                  typed yet, or nothing to find at all — and looked identical
                  either way. A pump with no customers registered could never
                  tell which, and it read as a broken dropdown rather than an
                  empty one. */}
              {customers.length === 0 ? (
                <p className="mt-2 text-[13px] leading-snug text-danger">
                  {t('counter.noCustomersYet')}
                </p>
              ) : matches.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(c.id)
                        setVehicleId('')
                      }}
                      className="rounded-full border border-divider px-3.5 py-2 text-[14px] font-semibold"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : search.trim() ? (
                <p className="mt-2 text-[13px] text-neutral-700">
                  {t('counter.noMatchingCustomer')}
                </p>
              ) : null}
            </>
          )}
        </div>

        {theirVehicles.length > 0 ? (
          <div>
            <span className="mb-1.5 block text-[14px] font-bold text-neutral-800">
              {t('counter.whichLorry')}
            </span>
            <div className="flex flex-wrap gap-2">
              {theirVehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicleId(vehicleId === v.id ? '' : v.id)}
                  className={`tabular rounded-2xl px-3.5 py-3 text-[15px] transition ${
                    vehicleId === v.id
                      ? 'bg-accent-700 font-bold text-bg'
                      : 'border border-divider font-semibold text-neutral-800'
                  }`}
                >
                  {v.vehicle_number}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <span className="mb-1.5 block text-[14px] font-bold text-neutral-800">
            {t('counter.whichFuel')}
          </span>
          <div className="flex gap-2">
            {(priced.length > 0 ? priced : fuels).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFuelId(f.id)
                  setNozzleId('')
                }}
                className={`flex-1 rounded-2xl px-2 py-3.5 text-[16px] transition ${
                  fuelId === f.id
                    ? 'bg-accent-700 font-bold text-bg'
                    : 'border border-divider font-semibold text-neutral-800'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('common.litres')} required>
            <NumberInput
              step="0.01"
              value={litres}
              className="py-3.5 text-right text-[24px] font-bold"
              onChange={(e) => {
                setLitres(e.target.value)
                setAmount(
                  e.target.value.trim() === '' ? '' : (n(e.target.value) * rate).toFixed(2),
                )
              }}
            />
          </Field>
          <Field label={t('counter.orRupees')}>
            <NumberInput
              step="0.01"
              value={amount}
              className="py-3.5 text-right text-[24px] font-bold"
              onChange={(e) => {
                setAmount(e.target.value)
                setLitres(
                  e.target.value.trim() === '' || rate <= 0
                    ? ''
                    : (n(e.target.value) / rate).toFixed(3),
                )
              }}
            />
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-[14px] font-bold text-neutral-800">
            {t('counter.whoIsServing')}
          </span>
          <div className="flex flex-wrap gap-2">
            {serving.map((f) => {
              const on = servedBy === f.staff_id
              return (
                <button
                  key={f.staff_id}
                  type="button"
                  onClick={() => setServedBy(on ? null : f.staff_id)}
                  aria-pressed={on}
                  aria-label={nameOf(f)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-3 text-[16px] transition ${
                    on ? 'bg-accent-700 font-bold text-bg' : 'border border-divider font-semibold'
                  }`}
                >
                  <span
                    className={`grid size-[26px] place-items-center rounded-full text-[12.5px] font-bold ${
                      on ? 'bg-bg text-accent-800' : 'bg-neutral-300 text-neutral-800'
                    }`}
                    aria-hidden
                  >
                    {nameOf(f).slice(0, 1)}
                  </span>
                  {nameOf(f)}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[12.5px] text-neutral-700">
            {t('counter.whoIsServingHint')}
          </p>
        </div>

        {more ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={t('credit.slipNo')}>
                <Input value={slipNo} onChange={(e) => setSlipNo(e.target.value)} />
              </Field>
              <Field label={t('credit.driver')}>
                <Input value={driver} onChange={(e) => setDriver(e.target.value)} />
              </Field>
            </div>
            <Field label={t('set.nozzles')}>
              <Select value={nozzleId} onChange={(e) => setNozzleId(e.target.value)}>
                <option value="">—</option>
                {nozzles
                  .filter((z) => z.fuel_type_id === fuelId)
                  .map((z) => (
                    <option key={z.nozzle_id} value={z.nozzle_id}>
                      {z.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMore(true)}
            className="self-start py-1 text-[15px] font-semibold text-accent-700"
          >
            {t('counter.moreFields')}
          </button>
        )}

        {rate <= 0 ? <Alert tone="accent">{t('set.noRate')}</Alert> : null}

        <div>
          <div className="flex items-center justify-between rounded-t-[20px] rounded-b-md bg-surface px-4.5 py-3.5">
            <span className="tabular text-[15px] text-neutral-800">
              {t('common.rate')} ₹{Number(rate).toFixed(2)}
            </span>
            <span className="tabular text-[28px] leading-none font-bold">
              {money(n(litres) * rate)}
            </span>
          </div>
          <Button
            size="lg"
            className="w-full rounded-t-md rounded-b-[22px]"
            disabled={pending || !customerId || n(litres) <= 0 || rate <= 0}
            onClick={() =>
              onSubmit(
                {
                  customer_id: customerId,
                  vehicle_id: vehicleId || null,
                  fuel_type_id: fuelId,
                  nozzle_id: nozzleId || null,
                  staff_id: servedBy,
                  quantity: n(litres),
                  sale_rate: Number(rate),
                  slip_number: slipNo.trim() || null,
                  driver_name: driver.trim() || null,
                  business_date: slip?.business_date ?? shift.business_date,
                  shift_id: shift.id,
                },
                slip?.id,
              )
            }
          >
            {pending
              ? t('common.saving')
              : slip
                ? t('counter.saveSlip')
                : t('counter.writeIt')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- the cash -- */
/**
 * The cash a filler hands over, typed by the filler who counted it.
 *
 * The policies always allowed this from the device; no screen ever offered it,
 * so the figure was typed in the office by somebody who had not touched the
 * notes. Cash only — the card machine and the UPI account are the pump's, and
 * a check constraint says so.
 */
function CashSheet({
  fillers,
  collections,
  denominations,
  owed,
  shiftMoney,
  locked,
  pending,
  nameOf,
  onBack,
  onSave,
}: {
  fillers: ShiftFiller[]
  collections: ShiftCollection[]
  /** every filler's cash, by note and coin, for this shift */
  denominations: ShiftCashDenomination[]
  /** sold less udhaar — cash, card, UPI and BPCL, all still lumped together */
  owed: number
  /** the shift's own card, UPI and BPCL totals — the shared machine, not any one filler */
  shiftMoney: { card: number; upi: number; bpcl: number }
  locked: boolean
  pending: boolean
  nameOf: (s: { name: string; name_gu?: string | null }) => string
  onBack: () => void
  onSave: (
    counts: { staff_id: string; denominations: { denomination: number; count: number }[] }[],
    payments: { card: number; upi: number; bpcl: number },
  ) => void
}) {
  const t = useT()

  // A filler does not arrive at a total, they count what is in the box — so
  // the figure typed is a count of notes and coins, one box per denomination,
  // and the total is whatever that comes to. A single lump-sum box read
  // exactly like a real shortfall the moment a stack was miscounted, with no
  // way back to which note it was.
  const [v, setV] = useState<Record<string, Record<number, string>>>(() =>
    Object.fromEntries(
      fillers.map((f) => [
        f.staff_id,
        Object.fromEntries(
          DENOMINATIONS.map((d) => {
            const had = denominations.find(
              (c) => c.staff_id === f.staff_id && c.denomination === d,
            )
            return [d, had && had.count > 0 ? String(had.count) : '']
          }),
        ),
      ]),
    ),
  )
  // Only one filler's notes and coins are open at a time — nine boxes apiece
  // is too much to show for everybody standing on the shift at once.
  const [open, setOpen] = useState<string | null>(null)

  // The card machine and the UPI QR are the shift's, shared by whoever is
  // serving — one figure each, not counted per filler the way cash is.
  const [pay, setPay] = useState({
    card: shiftMoney.card > 0 ? String(shiftMoney.card) : '',
    upi: shiftMoney.upi > 0 ? String(shiftMoney.upi) : '',
    bpcl: shiftMoney.bpcl > 0 ? String(shiftMoney.bpcl) : '',
  })
  const payTotal = n(pay.card) + n(pay.upi) + n(pay.bpcl)
  // What is actually left for the cash box, once card, UPI and BPCL have
  // taken their share of what the meters say went out — never all of it,
  // the way it read before anything but udhaar was subtracted.
  const expected = owed - payTotal

  const totalFor = (staffId: string) =>
    DENOMINATIONS.reduce((sum, d) => sum + d * n(v[staffId]?.[d] ?? ''), 0)

  const counted = fillers.reduce((sum, f) => sum + totalFor(f.staff_id), 0)
  const difference = counted - expected
  const dirty =
    fillers.some((f) =>
      DENOMINATIONS.some((d) => {
        const had = denominations.find(
          (c) => c.staff_id === f.staff_id && c.denomination === d,
        )
        const before = had && had.count > 0 ? String(had.count) : ''
        return (v[f.staff_id]?.[d] ?? '') !== before
      }),
    ) ||
    n(pay.card) !== shiftMoney.card ||
    n(pay.upi) !== shiftMoney.upi ||
    n(pay.bpcl) !== shiftMoney.bpcl

  return (
    <div className="pb-6">
      <Head title={t('counter.moneyHandedOver')} onBack={onBack} />

      <div className="px-4">
        <div className="rounded-[26px] bg-surface px-4.5 py-4">
          <Kick>{t('counter.owedByMeters')}</Kick>
          <div className="mt-2 flex items-end justify-between">
            <span className="tabular text-[32px] leading-none font-bold text-accent-2-800">
              {money(expected)}
            </span>
          </div>
        </div>

        <div className="mt-3.5 rounded-[26px] bg-surface px-4.5 pt-2.5 pb-4">
          <div className="pt-1.5 pb-1">
            <Kick>{t('counter.cardUpiBpcl')}</Kick>
          </div>
          <p className="pb-2.5 text-[12.5px] leading-snug text-neutral-700">
            {t('counter.cardUpiBpclHint')}
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label htmlFor="pay-card" className="mb-1 block text-[13px] font-semibold text-neutral-700">
                {t('mode.card')}
              </label>
              <NumberInput
                id="pay-card"
                step="1"
                disabled={locked}
                className="py-2.5 text-right text-[16px] font-bold"
                value={pay.card}
                onChange={(e) => setPay((prev) => ({ ...prev, card: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pay-upi" className="mb-1 block text-[13px] font-semibold text-neutral-700">
                {t('mode.upi')}
              </label>
              <NumberInput
                id="pay-upi"
                step="1"
                disabled={locked}
                className="py-2.5 text-right text-[16px] font-bold"
                value={pay.upi}
                onChange={(e) => setPay((prev) => ({ ...prev, upi: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pay-bpcl" className="mb-1 block text-[13px] font-semibold text-neutral-700">
                {t('mode.bpcl_card')}
              </label>
              <NumberInput
                id="pay-bpcl"
                step="1"
                disabled={locked}
                className="py-2.5 text-right text-[16px] font-bold"
                value={pay.bpcl}
                onChange={(e) => setPay((prev) => ({ ...prev, bpcl: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {fillers.length === 0 ? (
          <div className="mt-3.5">
            <Alert tone="accent">{t('counter.nobodyOn')}</Alert>
          </div>
        ) : (
          <div className="mt-3.5 flex flex-col gap-2.5">
            {fillers.map((f) => {
              const expanded = open === f.staff_id
              const total = totalFor(f.staff_id)
              // A shift counted before this screen broke cash down by note
              // still has a real total sitting in the book — showing "nothing
              // counted" over it would look like that money had been lost.
              const priorTotal = Number(
                collections.find((c) => c.staff_id === f.staff_id)?.cash_amount ?? 0,
              )
              return (
                <div
                  key={f.staff_id}
                  className="overflow-hidden rounded-[26px] bg-surface"
                >
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setOpen(expanded ? null : f.staff_id)}
                    className="flex w-full items-center gap-3 px-4.5 py-3.5 text-left disabled:opacity-60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-200 text-[16px] font-bold text-accent-800">
                      {nameOf(f).slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">
                      {nameOf(f)}
                      {total === 0 && priorTotal > 0 ? (
                        <span className="mt-0.5 block text-[12px] font-normal text-neutral-700">
                          {t('counter.notYetByNote')}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular shrink-0 text-[19px] font-bold">
                      {total > 0
                        ? money(total)
                        : priorTotal > 0
                          ? money(priorTotal)
                          : t('counter.noneCounted')}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="border-t border-neutral-300 px-4.5 pt-2 pb-4">
                      <p className="pt-2 pb-1 text-[13px] leading-snug text-neutral-700">
                        {t('counter.countByNote')}
                      </p>
                      <div className="grid grid-cols-3 gap-2.5">
                        {DENOMINATIONS.map((d) => (
                          <div key={d}>
                            <label
                              htmlFor={`cash-${f.staff_id}-${d}`}
                              className="tabular mb-1 block text-[13px] font-semibold text-neutral-700"
                            >
                              ₹{d}
                            </label>
                            <NumberInput
                              id={`cash-${f.staff_id}-${d}`}
                              inputMode="numeric"
                              min="0"
                              step="1"
                              disabled={locked}
                              aria-label={`${t('counter.howMany')} — ₹${d}`}
                              className="py-2.5 text-right text-[18px] font-bold"
                              value={v[f.staff_id]?.[d] ?? ''}
                              onChange={(e) =>
                                setV((prev) => ({
                                  ...prev,
                                  [f.staff_id]: { ...prev[f.staff_id], [d]: e.target.value },
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-neutral-300 pt-3">
                        <span className="text-[15px] font-semibold">{t('counter.counted')}</span>
                        <span className="tabular text-[19px] font-bold">{money(total)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(null)}
                        className="mt-3 w-full rounded-[18px] bg-neutral-200 py-2.5 text-[15px] font-semibold text-neutral-800"
                      >
                        {t('counter.doneCounting')}
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}

            <div className="rounded-[22px] bg-neutral-200 px-4.5 py-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[16px] font-semibold">{t('counter.counted')}</span>
                <span className="tabular text-[24px] font-bold">{money(counted)}</span>
              </div>
            </div>
          </div>
        )}

        {counted > 0 ? (
          <div
            className={`mt-3.5 flex items-center gap-3 rounded-[22px] px-4.5 py-4 ${
              difference === 0
                ? 'bg-accent-2-200'
                : 'border border-danger-200 bg-danger-100'
            }`}
          >
            {difference === 0 ? (
              <Check className="size-5 shrink-0 text-accent-2-800" strokeWidth={3} aria-hidden />
            ) : (
              <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div
                className={`tabular text-[18px] font-bold ${
                  difference === 0 ? 'text-accent-2-900' : 'text-danger'
                }`}
              >
                {difference === 0
                  ? t('counter.itTallies')
                  : `${money(Math.abs(difference))} ${
                      difference < 0
                        ? t('counter.lessThanExpected')
                        : t('counter.moreThanExpected')
                    }`}
              </div>
              {difference === 0 ? null : (
                <p className="mt-0.5 text-[13.5px] leading-snug">
                  {t('counter.officeRecordsDiff')}
                </p>
              )}
            </div>
          </div>
        ) : null}

        <p className="mt-3.5 rounded-[22px] bg-neutral-200 px-4.5 py-3.5 text-[13.5px] leading-relaxed text-neutral-800">
          {t('counter.cashOnly')}
        </p>

        <div className="mt-4">
          <Button
            size="lg"
            className="w-full"
            disabled={pending || locked || !dirty}
            onClick={() =>
              onSave(
                fillers.map((f) => ({
                  staff_id: f.staff_id,
                  denominations: DENOMINATIONS.map((d) => ({
                    denomination: d,
                    count: n(v[f.staff_id]?.[d] ?? ''),
                  })).filter((c) => c.count > 0),
                })),
                { card: n(pay.card), upi: n(pay.upi), bpcl: n(pay.bpcl) },
              )
            }
          >
            {pending ? t('common.saving') : t('counter.saveCount')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- handing in -- */
function FinishSheet({
  shift,
  hours,
  meters,
  slips,
  fillers,
  staff,
  hissab,
  pending,
  nameOf,
  onBack,
  onFinish,
}: {
  shift: ShiftDigest
  hours: ShiftHours
  meters: ShiftMeter[]
  slips: CreditSale[]
  fillers: ShiftFiller[]
  staff: Staff[]
  hissab: { sold: number; udhaar: number; cash: number; counted: number }
  pending: boolean
  nameOf: (s: { name: string; name_gu?: string | null }) => string
  onBack: () => void
  onFinish: (staffId: string | null) => void
}) {
  const t = useT()
  const [by, setBy] = useState<string | null>(fillers[0]?.staff_id ?? null)
  // Inherited numbers are not the same as closed ones — this counts only
  // the meters somebody on this shift has actually confirmed.
  const closed = meters.filter((m) => m.confirmed).length
  const difference = hissab.counted - hissab.cash
  const openedBy = staff.find((s) => s.id === shift.opened_by_staff)

  return (
    <div className="pb-6">
      <Head title={t('counter.handIn')} onBack={onBack} />

      <p className="px-4 text-[14.5px] leading-snug text-neutral-800">
        {shiftLabel(t, shift.name)}, {shiftHours(shift.name, hours)}
        {shift.opened_at ? `, ${t('counter.started')} ${formatTime(shift.opened_at)}` : ''}
        {openedBy ? ` ${t('counter.by')} ${nameOf(openedBy)}` : ''}. {t('counter.handInIntro')}
      </p>

      <div className="mt-3.5 px-4">
        <div className="rounded-[var(--radius-card)] bg-surface px-4.5 py-1">
          <Line
            ok={closed > 0}
            title={t('counter.metersRead')}
            sub={closed === 0 ? t('counter.walkSub') : undefined}
            value={String(closed)}
          />
          <Line ok title={t('counter.wentOut')} value={money(hissab.sold)} />
          <Line
            ok
            title={`${slips.length} ${
              slips.length === 1 ? t('counter.slipWritten') : t('counter.slipsWritten')
            }`}
            value={money(hissab.udhaar)}
          />
          <Line
            ok={hissab.counted > 0 && difference === 0}
            last
            title={t('counter.cashCounted')}
            sub={
              hissab.counted === 0
                ? t('counter.cashNotCounted')
                : difference === 0
                  ? t('counter.itTallies')
                  : `${money(Math.abs(difference))} ${
                      difference < 0
                        ? t('counter.lessThanExpected')
                        : t('counter.moreThanExpected')
                    }`
            }
            value={money(hissab.counted)}
          />
        </div>
      </div>

      <div className="mt-4 px-4">
        <div className="rounded-[24px] bg-accent-2-200 px-4.5 py-4">
          <div className="text-[15px] text-accent-2-900">{t('counter.whoWorkedIt')}</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {fillers.length === 0 ? (
              <span className="text-[14px] text-accent-2-800">{t('counter.nobodyOn')}</span>
            ) : (
              fillers.map((f) => (
                <button
                  key={f.staff_id}
                  type="button"
                  onClick={() => setBy(f.staff_id)}
                  aria-pressed={by === f.staff_id}
                  aria-label={nameOf(f)}
                  className={`inline-flex items-center gap-2 rounded-full py-2 pr-3.5 pl-2 text-[15px] font-semibold ${
                    by === f.staff_id ? 'bg-accent-2-700 text-bg' : 'bg-neutral-100'
                  }`}
                >
                  <span
                    className={`grid size-[26px] place-items-center rounded-full text-[13px] font-bold ${
                      by === f.staff_id ? 'bg-bg text-accent-2-900' : 'bg-accent-2-300 text-accent-2-900'
                    }`}
                  >
                    {nameOf(f).slice(0, 1)}
                  </span>
                  {nameOf(f)}
                </button>
              ))
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-accent-2-800">{t('counter.handedInBy')}</p>
        </div>
      </div>

      <div className="mt-4 px-4">
        <p className="mb-3 text-[13px] leading-relaxed text-neutral-700">
          {t('counter.nothingLocked')}
        </p>
        <Button
          size="lg"
          className="w-full"
          disabled={pending || shift.status !== 'open'}
          onClick={() => onFinish(by)}
        >
          {pending ? t('common.saving') : t('counter.finishShift')}
        </Button>
      </div>
    </div>
  )
}

function Line({
  ok,
  title,
  sub,
  value,
  last,
}: {
  ok: boolean
  title: string
  sub?: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 py-3.5 ${last ? '' : 'border-b border-neutral-300'}`}
    >
      <span
        className={`grid size-[30px] shrink-0 place-items-center rounded-full text-bg ${
          ok ? 'bg-accent-2' : 'bg-danger'
        }`}
      >
        {ok ? (
          <Check className="size-4" strokeWidth={3} aria-hidden />
        ) : (
          <TriangleAlert className="size-3.5" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold">{title}</span>
        {sub ? (
          <span
            className={`tabular block truncate text-[13px] ${ok ? 'text-neutral-700' : 'font-semibold text-danger'}`}
          >
            {sub}
          </span>
        ) : null}
      </span>
      <span className="tabular shrink-0 text-[16px] font-semibold">{value}</span>
    </div>
  )
}

/* -------------------------------------------------------- who is on -- */
/**
 * The fillers standing on this shift.
 *
 * Settled when the shift is started, and changed here when the night turns
 * out differently — somebody does not turn up, a colleague takes their shift,
 * and that is decided on the forecourt rather than telephoned to the office.
 */
function FillerList({
  fillers,
  staff,
  locked,
  pending,
  nameOf,
  onAdd,
  onRemove,
}: {
  fillers: ShiftFiller[]
  staff: Staff[]
  locked: boolean
  pending: boolean
  nameOf: (s: { name: string; name_gu?: string | null }) => string
  onAdd: (staffId: string) => void
  onRemove: (staffId: string) => void
}) {
  const t = useT()
  const notOn = staff.filter((s) => !fillers.some((f) => f.staff_id === s.id))

  return (
    <div className="px-4 pb-4">
      <div className="pt-1 pb-3">
        <h1 className="text-[24px]">{t('counter.rostered')}</h1>
      </div>

      {fillers.length === 0 ? (
        <Alert tone="accent">{t('counter.nobodyOn')}</Alert>
      ) : (
        fillers.map((f) => (
          <div
            key={f.staff_id}
            className="mb-2.5 flex items-center gap-3.5 rounded-[24px] bg-surface p-4"
          >
            <span className="grid size-13 shrink-0 place-items-center rounded-full bg-accent-200 text-[20px] font-bold text-accent-800">
              {nameOf(f).slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[19px] font-semibold">{nameOf(f)}</span>
              {f.covering ? (
                <span className="mt-1 inline-block">
                  <Badge tone="accent">{t('counter.covering')}</Badge>
                </span>
              ) : (
                <span className="block text-[13px] text-neutral-700">
                  {t('counter.onTheRoster')}
                </span>
              )}
            </span>
            {locked ? null : (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => onRemove(f.staff_id)}
              >
                {t('common.remove')}
              </Button>
            )}
          </div>
        ))
      )}

      {locked || notOn.length === 0 ? null : (
        <div className="mt-3 rounded-[var(--radius-card)] bg-neutral-200 px-4.5 pt-4 pb-5">
          <div className="text-[16px] font-bold">{t('counter.addCover')}</div>
          <p className="mt-1 text-[13.5px] leading-snug text-neutral-800">
            {t('counter.addCoverHint')}
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {notOn.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => onAdd(s.id)}
                aria-label={nameOf(s)}
                className="inline-flex items-center gap-2 rounded-full border border-divider py-2 pr-4 pl-2 text-[15px] font-semibold"
              >
                <span className="grid size-7 place-items-center rounded-full bg-neutral-300 text-[13px] font-bold text-neutral-800">
                  {nameOf(s).slice(0, 1)}
                </span>
                {nameOf(s)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------- which shift -- */
/**
 * Moving the device onto another shift.
 *
 * The working day plus the one before it, which is exactly as far as the
 * counter's policies reach. Everything written on the device follows what is
 * picked here, so each row says what it is and what state it is in rather
 * than leaving the filler to remember.
 */
function SwitchSheet({
  today,
  hours,
  current,
  todays,
  earlier,
  nameOf,
  onBack,
  onPick,
  onStart,
}: {
  today: string
  hours: ShiftHours
  current: ShiftDigest | null
  todays: ShiftDigest[]
  earlier: ShiftDigest[]
  nameOf: (s: { name: string; name_gu?: string | null }) => string
  onBack: () => void
  onPick: (id: string) => void
  onStart: () => void
}) {
  const t = useT()

  const row = (s: ShiftDigest, dated: boolean) => {
    const here = current?.id === s.id
    const approved = s.status === 'approved'
    const inner = (
      <>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold">
            {shiftLabel(t, s.name)}
            {dated ? (
              <span className="text-[14px] font-normal"> · {formatDateLong(s.business_date).split(',')[0]}</span>
            ) : null}
          </div>
          <div className="tabular mt-0.5 truncate text-[13px] text-neutral-700">
            {shiftHours(s.name, hours)} ·{' '}
            {s.status === 'open'
              ? `${t('counter.started')} ${formatTime(s.opened_at)}`
              : approved
                ? t('counter.askOffice')
                : `${t('counter.handedIn')} ${formatTime(s.closed_at)}`}
          </div>
          <div className="tabular mt-0.5 truncate text-[13px] text-neutral-700">
            {money(s.sold)}
            {s.fillers.length > 0
              ? ` · ${s.fillers.map((f) => nameOf(f)).join(', ')}`
              : ''}
          </div>
        </div>
        {here ? (
          <span className="shrink-0 rounded-full bg-accent-700 px-2.5 py-1.5 text-[12px] font-bold text-bg">
            {t('counter.onNow')}
          </span>
        ) : approved ? (
          <Lock className="size-5 shrink-0 text-neutral-600" aria-hidden />
        ) : (
          <ArrowLeft className="size-5 shrink-0 rotate-180 text-neutral-600" aria-hidden />
        )}
      </>
    )

    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onPick(s.id)}
        className={`mb-2.5 flex w-full items-center gap-3.5 rounded-[22px] px-4 py-3.5 text-left ${
          here ? 'border-2 border-accent bg-accent-200' : dated ? 'bg-neutral-200' : 'bg-surface'
        }`}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className="pb-6">
      <Head title={t('counter.whichShiftQ')} onBack={onBack} />

      <p className="px-4 text-[14px] leading-snug text-neutral-800">
        {t('counter.writesGoTo')}
      </p>

      <div className="flex items-baseline justify-between px-5 pt-4.5 pb-2">
        <Kick>{t('counter.todayAtPump')}</Kick>
        <span className="tabular text-[12.5px] text-neutral-700">{formatDateLong(today)}</span>
      </div>

      <div className="px-4">
        {SHIFTS.map((option) => {
          const it = todays.find((s) => s.name === option.name)
          if (it) return row(it, false)
          return (
            <button
              key={option.name}
              type="button"
              onClick={onStart}
              className="mb-2.5 flex w-full items-center gap-3.5 rounded-[22px] border border-dashed border-neutral-400 px-4 py-3.5 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-bold">{t(option.key)}</div>
                <div className="tabular mt-0.5 text-[13px] text-neutral-700">
                  {shiftHours(option.name, hours)} · {t('counter.shiftNotOpen')}
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-divider px-3 py-1.5 text-[13px] font-bold">
                {t('counter.startShift')}
              </span>
            </button>
          )
        })}
      </div>

      {earlier.length > 0 ? (
        <>
          <div className="px-5 pt-4 pb-2">
            <Kick>{t('counter.yesterday')}</Kick>
          </div>
          <div className="px-4">{earlier.map((s) => row(s, true))}</div>
        </>
      ) : null}

      <p className="mt-2 px-5 text-[13px] leading-relaxed text-neutral-700">
        {t('counter.switchFootnote')}
      </p>
    </div>
  )
}
