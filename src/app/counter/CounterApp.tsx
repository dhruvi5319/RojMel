'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, Fuel, Gauge, LogOut, Truck, UserRound,
} from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { useLang } from '@/lib/i18n/client'
import { litres as fmtLitres, money } from '@/lib/format'
import type {
  FuelType, NozzleState, Shift, Staff, UserRole, Vehicle,
} from '@/lib/database.types'
import { LanguageSeg } from '@/components/AppNav'
import { Alert, Badge, Button, Card, Field, NumberInput, Select, Input } from '@/components/ui'
import { shiftHours, shiftLabel } from '@/lib/shifts'
import {
  closeMyShift, counterReading, counterSlip, ensureShift, reopenMyShift,
} from './actions'

export interface CounterCustomer {
  id: string
  name: string
}

type View = 'pick' | 'menu' | 'slip' | 'reading' | 'done'

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
      const r = await closeMyShift(id)
      if (r.error) setError(r.error)
      else router.refresh()
    })
  }

  function reopenShift(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await reopenMyShift(id)
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
            <h1 className="mb-5 text-2xl font-semibold">
              {shiftLabel(t, shiftNow.name)}
              <span className="ml-3 align-middle text-[14px] font-normal text-neutral-600">
                {shiftHours(shiftNow.name)}
              </span>
            </h1>

            <ShiftCard
              shift={myShift}
              running={shiftNow}
              pending={pending}
              onOpen={openShift}
              onClose={closeShift}
              onReopen={reopenShift}
            />

            {error ? (
              <div className="mb-4">
                <Alert tone="danger">{error}</Alert>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {/* The meter belongs to the shift: any one of its fillers reads
                  it, so this does not ask who is pressing it. */}
              <BigButton
                icon={Gauge}
                label={t('counter.enterReading')}
                disabled={!myShift}
                onClick={() => {
                  setError(null)
                  setView('reading')
                }}
              />
              {/* A slip belongs to whoever served the lorry, so this one asks. */}
              <BigButton
                icon={Truck}
                label={t('counter.newSlip')}
                disabled={!myShift}
                onClick={() => asSomebody('slip')}
              />
            </div>

            {!myShift ? (
              <p className="mt-3 text-[13px] text-neutral-600">
                {t('counter.startFirst')}
              </p>
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

        {/* ----------------------------------------------------- reading -- */}
        {view === 'reading' ? (
          <ReadingForm
            staffId={who?.id ?? null}
            nozzles={nozzles}
            shift={myShift!}
            pending={pending}
            error={error}
            onBack={() => setView('menu')}
            onSubmit={(payload) => {
              setError(null)
              startTransition(async () => {
                const result = await counterReading(payload)
                if (result.error) setError(result.error)
                else {
                  setView('done')
                  router.refresh()
                }
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

function BigButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: typeof Truck
  label: string
  onClick: () => void
  /** Nothing can be written until the filler has said which shift they are on. */
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-surface px-4 py-11 text-[18px] font-semibold transition not-disabled:hover:bg-accent-100 disabled:opacity-45"
    >
      <Icon className="size-8 text-accent" aria-hidden />
      {label}
    </button>
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

/* --------------------------------------------------------- reading form -- */

function ReadingForm({
  staffId,
  nozzles,
  shift,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  staffId: string | null
  nozzles: NozzleState[]
  /** the shift this filler is on — the meter belongs to it */
  shift: Shift
  pending: boolean
  error: string | null
  onBack: () => void
  onSubmit: (payload: Parameters<typeof counterReading>[0]) => void
}) {
  const t = useT()

  const [nozzleId, setNozzleId] = useState(nozzles[0]?.nozzle_id ?? '')
  const nozzle = nozzles.find((z) => z.nozzle_id === nozzleId)

  const [opening, setOpening] = useState(String(nozzle?.last_closing ?? 0))
  const [closing, setClosing] = useState('')
  const [test, setTest] = useState('0')

  const l = closing.trim() === '' ? 0 : n(closing) - n(opening) - n(test)
  const rate = Number(nozzle?.sale_rate ?? 0)


  return (
    <div>
      <BackBar label={t('counter.enterReading')} onBack={onBack} />

      <Card className="flex flex-col gap-4 p-5">
        {/* The meter belongs to the shift this filler is on, and they said
            which at the top of their screen. */}
        <div className="flex items-center justify-between rounded-full bg-surface px-5 py-3 text-[13.5px]">
          <span className="text-neutral-600">{t('counter.goesTo')}</span>
          <span className="font-semibold">{shiftLabel(t, shift.name)}</span>
        </div>

        <Field label={t('set.nozzles')} required>
          <Select
            value={nozzleId}
            className="py-3 text-lg"
            onChange={(e) => {
              setNozzleId(e.target.value)
              const nz = nozzles.find((z) => z.nozzle_id === e.target.value)
              setOpening(String(nz?.last_closing ?? 0))
              setClosing('')
            }}
          >
            {nozzles.map((z) => (
              <option key={z.nozzle_id} value={z.nozzle_id}>
                {z.name} — {z.fuel_name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('shift.opening')} required>
            <NumberInput
              step="0.001"
              value={opening}
              className="py-3 text-lg"
              onChange={(e) => setOpening(e.target.value)}
            />
          </Field>
          <Field label={t('shift.closing')} required>
            <NumberInput
              step="0.001"
              value={closing}
              className="py-3 text-lg"
              onChange={(e) => setClosing(e.target.value)}
            />
          </Field>
        </div>

        <Field label={t('shift.testing')} hint={t('shift.testHint')}>
          <NumberInput
            step="0.001"
            value={test}
            onChange={(e) => setTest(e.target.value)}
          />
        </Field>

        <div className="flex items-center justify-between rounded-full bg-surface px-5 py-3">
          <span className="tabular font-medium">{fmtLitres(Math.max(0, l))}</span>
          <span className="tabular text-xl font-semibold">
            {money(Math.max(0, l) * rate)}
          </span>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button
          size="lg"
          disabled={pending || !nozzleId || closing.trim() === '' || l < 0}
          onClick={() =>
            onSubmit(
              {
                shift_id: shift.id,
                nozzle_id: nozzleId,
                staff_id: staffId,
                opening_reading: n(opening),
                closing_reading: n(closing),
                test_litres: n(test),
                sale_rate: rate,
              },
            )
          }
        >
          {pending ? t('common.saving') : t('common.save')}
        </Button>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------ shift card -- */
/**
 * The shift this filler is on — one, because a person works one.
 *
 * They come on duty and say which half of the day they have; from then on it
 * is simply their shift, and every reading and slip belongs to it without
 * being asked again. The other shift is somebody else's and they cannot touch
 * it: closing a colleague's shift is not a thing a pump lets a filler do.
 */
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
            {t('counter.openMyShift')}
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
                : t('counter.shiftYours')}
          </div>
        </div>

        <div className="shrink-0">
          {status === 'open' ? (
            <Button size="md" disabled={pending} onClick={() => onClose(shift.id)}>
              {t('counter.closeMyShift')}
            </Button>
          ) : status === 'submitted' ? (
            <Button
              size="md"
              variant="secondary"
              disabled={pending}
              onClick={() => onReopen(shift.id)}
            >
              {t('counter.reopenMyShift')}
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
