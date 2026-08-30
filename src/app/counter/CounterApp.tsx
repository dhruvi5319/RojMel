'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Fuel, Gauge, LogOut, Truck, UserRound } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { useLang } from '@/lib/i18n/client'
import { litres as fmtLitres, money } from '@/lib/format'
import type {
  FuelType, NozzleState, Shift, Staff, UserRole, Vehicle,
} from '@/lib/database.types'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Alert, Badge, Button, Card, Field, NumberInput, Select, Input } from '@/components/ui'
import { counterReading, counterSlip, ensureShift } from './actions'

export interface CounterCustomer {
  id: string
  name: string
}

type View = 'pick' | 'menu' | 'slip' | 'reading' | 'done'

const n = (v: string) => (v.trim() === '' ? 0 : Number(v))

const SHIFT_OPTIONS = [
  { name: 'Morning', key: 'shift.morning', order: 1 },
  { name: 'Evening', key: 'shift.evening', order: 2 },
  { name: 'Night', key: 'shift.night', order: 3 },
] as const

export function CounterApp({
  stationName,
  role,
  today,
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

  const [view, setView] = useState<View>('pick')
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
    setView('menu')
  }

  function confirmPin() {
    if (who && pin === who.pin) {
      setPinError(false)
      setView('menu')
    } else {
      setPinError(true)
    }
  }

  /* ------------------------------------------------------------ header -- */
  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-white">
          <Fuel className="size-5" aria-hidden />
        </span>
        <div>
          <div className="font-semibold leading-tight">{stationName}</div>
          <div className="text-xs text-muted">{t('counter.title')}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <LanguageToggle />
        {who ? (
          <button
            type="button"
            onClick={() => {
              setWho(null)
              setView('pick')
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium"
          >
            <UserRound className="size-4" aria-hidden />
            {nameOf(who)}
          </button>
        ) : null}
        {role !== 'counter' ? (
          <button
            type="button"
            onClick={() => router.push('/')}
            aria-label={t('nav.dashboard')}
            className="rounded-lg border border-border p-2"
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
              <p className="mb-5 text-muted">{t('counter.enterPin')}</p>
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
                  className="tabular w-full rounded-lg border border-border bg-surface px-4 py-4 text-center text-3xl tracking-[0.5em] outline-none focus:border-brand"
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
              <h1 className="mb-5 text-2xl font-semibold">{t('counter.whoAreYou')}</h1>
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
                      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-3 py-6 text-center text-lg font-medium transition hover:border-brand hover:bg-brand-soft"
                    >
                      <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
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
              {t('common.today')} — {nameOf(who!)}
            </h1>
            <div className="grid gap-3 sm:grid-cols-2">
              <BigButton
                icon={Truck}
                label={t('counter.newSlip')}
                onClick={() => {
                  setError(null)
                  setView('slip')
                }}
              />
              <BigButton
                icon={Gauge}
                label={t('counter.enterReading')}
                onClick={() => {
                  setError(null)
                  setView('reading')
                }}
              />
            </div>
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
            shifts={shifts}
            pending={pending}
            error={error}
            onBack={() => setView('menu')}
            onSubmit={(payload, shiftName, shiftOrder) => {
              setError(null)
              startTransition(async () => {
                let shiftId = payload.shift_id
                if (!shiftId) {
                  const s = await ensureShift(shiftName, shiftOrder, today)
                  if ('error' in s && s.error) {
                    setError(s.error)
                    return
                  }
                  shiftId = (s as { id: string }).id
                }
                const result = await counterReading({ ...payload, shift_id: shiftId })
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
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok">
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
}: {
  icon: typeof Truck
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-lg font-semibold transition hover:border-brand hover:bg-brand-soft"
    >
      <Icon className="size-8 text-brand" aria-hidden />
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

        <Field label={t('set.fuels')} required>
          <div className="grid grid-cols-2 gap-2">
            {(priced.length > 0 ? priced : fuels).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFuelId(f.id)
                  setNozzleId('')
                }}
                className={`rounded-lg border px-3 py-3 text-lg font-medium transition ${
                  fuelId === f.id
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-border bg-surface'
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

        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
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
              litres: n(litres),
              sale_rate: Number(rate),
              slip_number: slipNo.trim() || null,
              driver_name: driver.trim() || null,
              business_date: today,
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
  shifts,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  staffId: string | null
  nozzles: NozzleState[]
  shifts: Shift[]
  pending: boolean
  error: string | null
  onBack: () => void
  onSubmit: (
    payload: Omit<Parameters<typeof counterReading>[0], 'shift_id'> & {
      shift_id: string | null
    },
    shiftName: string,
    shiftOrder: number,
  ) => void
}) {
  const t = useT()
  const [shiftChoice, setShiftChoice] = useState(
    shifts[0]?.name ?? SHIFT_OPTIONS[0].name,
  )
  const [nozzleId, setNozzleId] = useState(nozzles[0]?.nozzle_id ?? '')
  const nozzle = nozzles.find((z) => z.nozzle_id === nozzleId)

  const [opening, setOpening] = useState(String(nozzle?.last_closing ?? 0))
  const [closing, setClosing] = useState('')
  const [test, setTest] = useState('0')

  const l = closing.trim() === '' ? 0 : n(closing) - n(opening) - n(test)
  const rate = Number(nozzle?.sale_rate ?? 0)
  const existingShift = shifts.find((s) => s.name === shiftChoice)
  const option = SHIFT_OPTIONS.find((o) => o.name === shiftChoice)

  return (
    <div>
      <BackBar label={t('counter.enterReading')} onBack={onBack} />

      <Card className="flex flex-col gap-4 p-5">
        <Field label={t('shift.name')} required>
          <div className="grid grid-cols-3 gap-2">
            {SHIFT_OPTIONS.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setShiftChoice(s.name)}
                className={`rounded-lg border px-2 py-3 font-medium transition ${
                  shiftChoice === s.name
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-border bg-surface'
                }`}
              >
                {t(s.key)}
              </button>
            ))}
          </div>
        </Field>

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

        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
          <span className="tabular font-medium">{fmtLitres(Math.max(0, l))}</span>
          <span className="tabular text-xl font-semibold">
            {money(Math.max(0, l) * rate)}
          </span>
        </div>

        {existingShift ? (
          <Badge tone="brand">
            {existingShift.name} — {t(`shift.${existingShift.status}`)}
          </Badge>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button
          size="lg"
          disabled={pending || !nozzleId || closing.trim() === '' || l < 0}
          onClick={() =>
            onSubmit(
              {
                shift_id: existingShift?.id ?? null,
                nozzle_id: nozzleId,
                staff_id: staffId,
                opening_reading: n(opening),
                closing_reading: n(closing),
                test_litres: n(test),
                sale_rate: rate,
              },
              shiftChoice,
              option?.order ?? 1,
            )
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
        className="rounded-lg border border-border bg-surface p-2.5"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <h1 className="text-xl font-semibold">{label}</h1>
    </div>
  )
}
