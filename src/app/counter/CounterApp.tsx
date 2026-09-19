'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, Fuel, LogOut, UserRound,
} from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { useLang } from '@/lib/i18n/client'
import { formatDateLong, money } from '@/lib/format'
import type {
  FuelType, NozzleState, Shift, ShiftFiller, ShiftMeter, Staff, UserRole, Vehicle,
} from '@/lib/database.types'
import { LanguageSeg } from '@/components/AppNav'
import { Alert, Badge, Button, Card, Field, NumberInput, Select, Input } from '@/components/ui'
import { shiftHours, shiftLabel } from '@/lib/shifts'
import {
  addFillerToShift, counterSlip, ensureShift, finishShift, removeFillerFromShift,
  reopenShift as reopenShiftAction, saveMeterReading,
} from './actions'

export interface CounterCustomer {
  id: string
  name: string
}

type View = 'pick' | 'menu' | 'slip' | 'done'

/**
 * Three tabs, because the device is used for three separate errands: the
 * shift itself (start it, read the meters, see the hissab, finish it), who is
 * standing on it today, and the udhaar written during it.
 */
type Tab = 'shift' | 'fillers' | 'udhaar'

const n = (v: string) => (v.trim() === '' ? 0 : Number(v))


export function CounterApp({
  stationName,
  role,
  today,
  shiftNow,
  staff,
  nozzles,
  fuels,
  customers,
  vehicles,
  shifts,
  meters,
  fillers,
  hissab,
}: {
  stationName: string
  role: UserRole
  today: string
  /** the shift the clock says is running, and its hours */
  shiftNow: { name: string; order: number }
  staff: Staff[]
  nozzles: NozzleState[]
  fuels: FuelType[]
  customers: CounterCustomer[]
  vehicles: Vehicle[]
  shifts: Shift[]
  /** every nozzle and CNG point, with what it read when the shift began */
  meters: ShiftMeter[]
  /** who is on this shift, rostered or covering */
  fillers: ShiftFiller[]
  /** what the shift sold, what went on udhaar, and so what cash is owed */
  hissab: { sold: number; udhaar: number; cash: number }
}) {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  /*
   * The device opens on the shift, not on a name.
   *
   * A shift has several fillers and any one of them notes the meter, so
   * asking "who are you?" before the device will show anything is asking a
   * question that mostly does not matter. It matters for the two things that
   * belong to a person — the slip they wrote and the cash they hand over —
   * and it is asked there, at the moment it counts.
   */
  const [view, setView] = useState<View>('menu')
  const [tab, setTab] = useState<Tab>('shift')
  /** Where to go once somebody has said who they are. */
  const [after, setAfter] = useState<View>('menu')
  const [who, setWho] = useState<Staff | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (s: Staff) => (lang === 'gu' && s.name_gu ? s.name_gu : s.name)

  function choose(member: Staff) {
    if (member.pin) {
      setWho(member)
      setPin('')
      setPinError(false)
      return
    }
    setWho(member)
    setView(after)
  }

  /** For the two things that belong to a person rather than to the shift. */
  function asSomebody(target: View) {
    setError(null)
    setAfter(target)
    setView(who ? target : 'pick')
  }

  /*
   * The shift being worked, which the clock already knows: the day runs 7am
   * to 7pm and the night 7pm to 7am. Nobody is asked to choose it, and
   * everything written on this device is tagged to it.
   */
  const myShift = shifts.find((sh) => sh.name === shiftNow.name)

  /* The shift's three acts. */
  function openShift(name: string, order: number) {
    setError(null)
    startTransition(async () => {
      const r = await ensureShift(name, order, today)
      if ('error' in r && r.error) setError(r.error)
      else router.refresh()
    })
  }

  function closeShift(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await finishShift(id)
      if (r.error) setError(r.error)
      else router.refresh()
    })
  }

  function reopenShift(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await reopenShiftAction(id)
      if (r.error) setError(r.error)
      else router.refresh()
    })
  }

  function confirmPin() {
    if (who && pin === who.pin) {
      setPinError(false)
      setView(after)
    } else {
      setPinError(true)
    }
  }

  /* ------------------------------------------------------------ header -- */
  const header = (
    <header className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
      {/* min-w-0 or the truncate below never fires: a flex item will not
          shrink past its content, so a long pump name pushed the language
          toggle and the filler's name off a narrow phone. */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-bg">
          <Fuel className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="truncate font-[family-name:var(--font-heading)] text-[16px] leading-tight">
            {stationName}
          </div>
          <div className="text-xs text-neutral-600">{t('counter.title')}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LanguageSeg compact />
        {who ? (
          <button
            type="button"
            onClick={() => {
              setWho(null)
              setView('pick')
            }}
            className="inline-flex max-w-[9rem] items-center gap-1.5 rounded-full border border-divider px-3 py-2 text-[13px] font-semibold"
          >
            <UserRound className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{nameOf(who)}</span>
          </button>
        ) : null}
        {role !== 'counter' ? (
          <button
            type="button"
            onClick={() => router.push('/')}
            aria-label={t('nav.dashboard')}
            className="rounded-lg border border-divider p-2"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </header>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      {header}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {/* --------------------------------------------------- pick user -- */}
        {view === 'pick' ? (
          who?.pin ? (
            <div>
              <h1 className="mb-1 text-2xl font-semibold">{nameOf(who)}</h1>
              <p className="mb-5 text-neutral-600">{t('counter.enterPin')}</p>
              <Card className="p-5">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value)
                    setPinError(false)
                  }}
                  className="tabular w-full rounded-lg border border-divider bg-surface px-4 py-4 text-center text-3xl tracking-[0.5em] outline-none focus:border-accent"
                />
                {pinError ? (
                  <div className="mt-3">
                    <Alert tone="danger">{t('counter.wrongPin')}</Alert>
                  </div>
                ) : null}
                <div className="mt-4 flex gap-3">
                  <Button size="lg" onClick={confirmPin}>
                    {t('common.confirm')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      setWho(null)
                      setPin('')
                    }}
                  >
                    {t('common.back')}
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            <div>
              <h1 className="mb-1 text-2xl font-semibold">
                {after === 'slip' ? t('counter.whoIsServing') : t('counter.whoAreYou')}
              </h1>
              <p className="mb-5 text-[13.5px] text-neutral-600">
                {t('counter.whoIsServingHint')}
              </p>
              {staff.length === 0 ? (
                <Alert tone="accent">
                  No staff have been added yet. Add them under Staff first.
                </Alert>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {staff.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => choose(s)}
                      className="flex flex-col items-center gap-2.5 rounded-[var(--radius-card)] bg-surface px-3 py-7 text-center text-[17px] font-semibold transition hover:bg-accent-100"
                    >
                      <span className="grid size-12 place-items-center rounded-full bg-accent-200 text-accent-800">
                        <UserRound className="size-6" aria-hidden />
                      </span>
                      {nameOf(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        ) : null}

        {/* -------------------------------------------------------- menu -- */}
        {view === 'menu' ? (
          <div>
            <h1 className="mb-1 text-2xl font-semibold">
              {shiftLabel(t, shiftNow.name)}
              <span className="ml-3 align-middle text-[14px] font-normal text-neutral-600">
                {shiftHours(shiftNow.name)}
              </span>
            </h1>
            <p className="mb-4 text-[13px] text-neutral-600">{formatDateLong(today)}</p>

            {/* Three errands, three tabs. */}
            <div className="mb-5 flex gap-2 overflow-x-auto">
              {([
                ['shift', t('counter.tabShift')],
                ['fillers', t('counter.tabFillers')],
                ['udhaar', t('counter.tabUdhaar')],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-[14px] font-semibold transition ${
                    tab === key
                      ? 'bg-accent text-bg'
                      : 'bg-surface text-neutral-700 hover:bg-accent-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {error ? (
              <div className="mb-4">
                <Alert tone="danger">{error}</Alert>
              </div>
            ) : null}

            {tab === 'shift' ? (
              <>
                <ShiftCard
                  shift={myShift}
                  running={shiftNow}
                  pending={pending}
                  onOpen={openShift}
                  onClose={closeShift}
                  onReopen={reopenShift}
                />
                {myShift ? (
                  <>
                    <MeterSheet
                      meters={meters}
                      pending={pending}
                      onSave={(nozzles, cng) => {
                        setError(null)
                        startTransition(async () => {
                          const r = await saveMeterReading(myShift.id, nozzles, cng)
                          if (r.error) setError(r.error)
                          else router.refresh()
                        })
                      }}
                    />
                    <Hissab {...hissab} />
                  </>
                ) : null}
              </>
            ) : null}

            {tab === 'fillers' ? (
              <FillerList
                fillers={fillers}
                staff={staff}
                shift={myShift}
                pending={pending}
                onAdd={(staffId) => {
                  setError(null)
                  startTransition(async () => {
                    const r = await addFillerToShift(myShift!.id, staffId)
                    if (r.error) setError(r.error)
                    else router.refresh()
                  })
                }}
                onRemove={(staffId) => {
                  setError(null)
                  startTransition(async () => {
                    const r = await removeFillerFromShift(myShift!.id, staffId)
                    if (r.error) setError(r.error)
                    else router.refresh()
                  })
                }}
              />
            ) : null}

            {tab === 'udhaar' ? (
              <div className="rounded-[var(--radius-card)] bg-surface p-5">
                <p className="mb-4 text-[13.5px] text-neutral-600">
                  {t('counter.udhaarHint')}
                </p>
                <Button
                  size="lg"
                  disabled={!myShift}
                  onClick={() => asSomebody('slip')}
                >
                  {t('counter.newSlip')}
                </Button>
                {!myShift ? (
                  <p className="mt-3 text-[13px] text-neutral-600">
                    {t('counter.startFirst')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* -------------------------------------------------------- slip -- */}
        {view === 'slip' ? (
          <SlipForm
            today={today}
            staffId={who?.id ?? null}
            customers={customers}
            vehicles={vehicles}
            fuels={fuels}
            nozzles={nozzles}
            pending={pending}
            error={error}
            shift={myShift!}
            onBack={() => setView('menu')}
            onSubmit={(payload) => {
              setError(null)
              startTransition(async () => {
                const result = await counterSlip(payload)
                if (result.error) setError(result.error)
                else setView('done')
              })
            }}
          />
        ) : null}


        {/* -------------------------------------------------------- done -- */}
        {view === 'done' ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-accent-2-300 text-accent-2-900">
              <Check className="size-8" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold">{t('counter.done')}</h1>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => setView('menu')}>
                {t('counter.another')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setWho(null)
                  setView('pick')
                }}
              >
                {t('counter.switchUser')}
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

/* ----------------------------------------------------- meter sheet -- */
/**
 * Every nozzle on the forecourt, one box each.
 *
 * This is the walk somebody actually does: two pumps with a petrol and a
 * diesel nozzle on each point, and the CNG island, read in order and written
 * down. It asks for one number per meter, not an opening and a closing — the
 * closing of the shift going off is this same number, and the database puts
 * it in both places.
 */
function MeterSheet({
  meters,
  pending,
  onSave,
}: {
  meters: ShiftMeter[]
  pending: boolean
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
        m.opening_reading != null ? String(m.opening_reading) : '',
      ]),
    ),
  )

  if (meters.length === 0) return null
  const typed = meters.filter((m) => (v[m.meter_id] ?? '').trim() !== '').length

  return (
    <div className="mb-4 rounded-[var(--radius-card)] bg-surface p-5">
      <div className="text-[17px] font-semibold">{t('counter.meterSheet')}</div>
      <p className="mt-1 mb-4 text-[13px] text-neutral-600">{t('counter.meterHint')}</p>

      <div className="flex flex-col divide-y divide-divider">
        {meters.map((m) => (
          <div key={m.meter_id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="font-semibold">{m.name}</div>
              <div className="text-[12px] text-neutral-600">
                {m.fuel_name}
                {m.opening_reading != null
                  ? ` · ${t('counter.meterWas')} ${Number(m.opening_reading).toFixed(2)}`
                  : ''}
              </div>
            </div>
            <div className="w-36 shrink-0">
              <NumberInput
                step="0.001"
                aria-label={`${t('counter.meterNow')} — ${m.name}`}
                className="py-3 text-right text-lg"
                value={v[m.meter_id] ?? ''}
                onChange={(e) => setV((prev) => ({ ...prev, [m.meter_id]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Button
          size="lg"
          disabled={pending || typed === 0}
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
  )
}

/* ---------------------------------------------------------- hissab -- */
/** What the shift sold, what of it went on udhaar, and so what cash is owed. */
function Hissab({ sold, udhaar, cash }: { sold: number; udhaar: number; cash: number }) {
  const t = useT()
  const lines: [string, number, boolean][] = [
    [t('counter.wentOut'), sold, false],
    [t('counter.onUdhaar'), udhaar, false],
    [t('counter.cashDue'), cash, true],
  ]

  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-5">
      <div className="mb-3 text-[17px] font-semibold">{t('counter.hissab')}</div>
      <dl className="flex flex-col divide-y divide-divider">
        {lines.map(([label, value, strong]) => (
          <div key={label} className="flex justify-between gap-3 py-2.5">
            <dt className={strong ? 'font-semibold' : 'text-neutral-700'}>{label}</dt>
            <dd className={`tabular ${strong ? 'text-[17px] font-semibold' : ''}`}>
              {money(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/* ------------------------------------------------------- who is on -- */
/**
 * The fillers standing on this shift.
 *
 * The office says who is normally on the day and who on the night, and the
 * shift is seeded from that when it opens. But somebody does not turn up and
 * a colleague takes their shift, and that has to be sayable here, by the
 * people standing there, rather than telephoned to the office.
 */
function FillerList({
  fillers,
  staff,
  shift,
  pending,
  onAdd,
  onRemove,
}: {
  fillers: ShiftFiller[]
  staff: Staff[]
  shift: Shift | undefined
  pending: boolean
  onAdd: (staffId: string) => void
  onRemove: (staffId: string) => void
}) {
  const t = useT()
  const lang = useLang()
  const label = (s: { name: string; name_gu?: string | null }) =>
    (lang === 'gu' && s.name_gu) || s.name
  const [adding, setAdding] = useState('')

  const notOn = staff.filter((s) => !fillers.some((f) => f.staff_id === s.id))

  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-5">
      <div className="mb-3 text-[17px] font-semibold">{t('counter.rostered')}</div>

      {fillers.length === 0 ? (
        <p className="text-[13.5px] text-neutral-600">{t('counter.nobodyOn')}</p>
      ) : (
        <div className="flex flex-col divide-y divide-divider">
          {fillers.map((f) => (
            <div key={f.staff_id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <span className="font-semibold">{label(f)}</span>
                {f.covering ? (
                  <span className="ml-2">
                    <Badge tone="accent">{t('counter.covering')}</Badge>
                  </span>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || !shift}
                onClick={() => onRemove(f.staff_id)}
              >
                {t('common.remove')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {shift && notOn.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Field label={t('counter.addCover')}>
              <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">—</option>
                {notOn.map((s) => (
                  <option key={s.id} value={s.id}>
                    {label(s)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            size="md"
            disabled={pending || !adding}
            onClick={() => {
              onAdd(adding)
              setAdding('')
            }}
          >
            {t('common.add')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------ shift card -- */
function ShiftCard({
  shift,
  running,
  pending,
  onOpen,
  onClose,
  onReopen,
}: {
  shift: Shift | undefined
  /** what the clock says is running, for when nobody has started it yet */
  running: { name: string; order: number }
  pending: boolean
  onOpen: (name: string, order: number) => void
  onClose: (id: string) => void
  onReopen: (id: string) => void
}) {
  const t = useT()

  // Nobody has started it. There is nothing to choose — the clock already
  // says which shift this is — so this is one button, not a question.
  if (!shift) {
    return (
      <div className="mb-4 rounded-[var(--radius-card)] bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold">
              {shiftLabel(t, running.name)}
            </div>
            <div className="mt-0.5 text-[13px] text-neutral-600">
              {t('counter.shiftNotOpen')}
            </div>
          </div>
          <Button
            size="md"
            disabled={pending}
            onClick={() => onOpen(running.name, running.order)}
          >
            {t('counter.startShift')}
          </Button>
        </div>
      </div>
    )
  }

  const status = shift.status

  return (
    <div className="mb-4 rounded-[var(--radius-card)] bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[19px] font-semibold">{shiftLabel(t, shift.name)}</div>
          <div className="mt-0.5 text-[13px] text-neutral-600">
            {status === 'approved'
              ? t('counter.shiftApproved')
              : status === 'submitted'
                ? t('counter.shiftClosed')
                : t('counter.shiftRunning')}
          </div>
        </div>

        <div className="shrink-0">
          {status === 'open' ? (
            <Button size="md" disabled={pending} onClick={() => onClose(shift.id)}>
              {t('counter.finishShift')}
            </Button>
          ) : status === 'submitted' ? (
            <Button
              size="md"
              variant="secondary"
              disabled={pending}
              onClick={() => onReopen(shift.id)}
            >
              {t('counter.reopenShift')}
            </Button>
          ) : (
            <Badge tone="ok">
              <Check className="size-3.5" aria-hidden /> {t('shift.approved')}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ slip form -- */

function SlipForm({
  today,
  staffId,
  customers,
  vehicles,
  fuels,
  nozzles,
  shift,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  today: string
  staffId: string | null
  customers: CounterCustomer[]
  vehicles: Vehicle[]
  fuels: FuelType[]
  nozzles: NozzleState[]
  /** the shift this filler is on — every slip belongs to it */
  shift: Shift
  pending: boolean
  error: string | null
  onBack: () => void
  onSubmit: (payload: Parameters<typeof counterSlip>[0]) => void
}) {
  const t = useT()
  // Default to a fuel that actually has a price; one without a rate cannot be
  // sold and would only produce an error after the filler had typed everything.
  const priced = fuels.filter((f) =>
    nozzles.some((z) => z.fuel_type_id === f.id && Number(z.sale_rate) > 0))

  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [fuelId, setFuelId] = useState((priced[0] ?? fuels[0])?.id ?? '')
  const [nozzleId, setNozzleId] = useState('')
  const [litres, setLitres] = useState('')
  const [amount, setAmount] = useState('')
  const [slipNo, setSlipNo] = useState('')
  const [driver, setDriver] = useState('')

  const rate = useMemo(
    () => nozzles.find((z) => z.fuel_type_id === fuelId)?.sale_rate ?? 0,
    [fuelId, nozzles],
  )

  const theirVehicles = vehicles.filter((v) => v.customer_id === customerId)

  return (
    <div>
      <BackBar label={t('counter.newSlip')} onBack={onBack} />

      <Card className="flex flex-col gap-4 p-5">
        {/* The udhaar written in front of a filler belongs to their half of
            the day — and the app already knows which that is. Asking again is
            only a chance to answer wrongly. */}
        <div className="flex items-center justify-between rounded-full bg-surface px-5 py-3 text-[13.5px]">
          <span className="text-neutral-600">{t('counter.goesTo')}</span>
          <span className="font-semibold">{shiftLabel(t, shift.name)}</span>
        </div>

        <Field label={t('cust.title')} required>
          <Select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value)
              setVehicleId('')
            }}
            className="py-3 text-lg"
          >
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('credit.vehicle')}>
          <Select
            value={vehicleId}
            disabled={!customerId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="py-3 text-lg"
          >
            <option value="">—</option>
            {theirVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vehicle_number}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('common.fuel')} required>
          <div className="grid grid-cols-2 gap-2">
            {(priced.length > 0 ? priced : fuels).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFuelId(f.id)
                  setNozzleId('')
                }}
                className={`rounded-full px-3 py-3 text-[17px] font-semibold transition ${
                  fuelId === f.id
                    ? 'bg-accent text-bg'
                    : 'bg-surface text-neutral-700 hover:bg-accent-100'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.litres')} required>
            <NumberInput
              step="0.01"
              value={litres}
              className="py-3 text-lg"
              onChange={(e) => {
                setLitres(e.target.value)
                setAmount(
                  e.target.value.trim() === ''
                    ? ''
                    : (n(e.target.value) * rate).toFixed(2),
                )
              }}
            />
          </Field>
          <Field label={t('common.amount')}>
            <NumberInput
              step="0.01"
              value={amount}
              className="py-3 text-lg"
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

        <div className="grid grid-cols-2 gap-3">
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

        <div className="flex items-center justify-between rounded-full bg-surface px-5 py-3">
          <span className="font-medium">
            {t('common.rate')} ₹{Number(rate).toFixed(2)}
          </span>
          <span className="tabular text-xl font-semibold">
            {money(n(litres) * rate)}
          </span>
        </div>

        {rate <= 0 ? <Alert tone="accent">{t('set.noRate')}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button
          size="lg"
          disabled={pending || !customerId || n(litres) <= 0 || rate <= 0}
          onClick={() =>
            onSubmit({
              customer_id: customerId,
              vehicle_id: vehicleId || null,
              fuel_type_id: fuelId,
              nozzle_id: nozzleId || null,
              staff_id: staffId,
              quantity: n(litres),
              sale_rate: Number(rate),
              slip_number: slipNo.trim() || null,
              driver_name: driver.trim() || null,
              business_date: today,
              shift_id: shift.id,
            })
          }
        >
          {pending ? t('common.saving') : t('common.save')}
        </Button>
      </Card>
    </div>
  )
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="rounded-lg border border-divider bg-surface p-2.5"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <h1 className="text-xl font-semibold">{label}</h1>
    </div>
  )
}
