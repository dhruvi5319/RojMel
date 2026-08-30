'use client'

import { useMemo, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { money } from '@/lib/format'
import type {
  CustomerBalance, FuelType, NozzleState, Shift, Staff, Vehicle,
} from '@/lib/database.types'
import {
  Alert, Field, Input, NumberInput, Select,
} from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { createCreditSale } from '../actions'

const n = (v: string) => (v.trim() === '' ? 0 : Number(v))

export function CreditSlipForm({
  date,
  preselectedCustomer,
  customers,
  vehicles,
  fuels,
  nozzles,
  shifts,
  staff,
}: {
  date: string
  preselectedCustomer: string
  customers: CustomerBalance[]
  vehicles: Vehicle[]
  fuels: FuelType[]
  nozzles: NozzleState[]
  shifts: Shift[]
  staff: Staff[]
}) {
  const t = useT()

  const [customerId, setCustomerId] = useState(preselectedCustomer)
  const [fuelId, setFuelId] = useState(fuels[0]?.id ?? '')
  const [rate, setRate] = useState('')
  const [litres, setLitres] = useState('')
  const [amount, setAmount] = useState('')

  const customer = customers.find((c) => c.customer_id === customerId)
  const customerVehicles = vehicles.filter((v) => v.customer_id === customerId)

  // The live rate for the chosen fuel, taken from whichever nozzle serves it.
  const liveRate = useMemo(() => {
    const nz = nozzles.find((z) => z.fuel_type_id === fuelId)
    return nz?.sale_rate ?? null
  }, [fuelId, nozzles])

  const effectiveRate = rate.trim() === '' ? (liveRate ?? 0) : n(rate)

  /* Drivers ask for fuel both ways — "40 litres" and "two thousand rupees
     worth". Whichever box is typed in, the other follows. */
  function onLitres(value: string) {
    setLitres(value)
    setAmount(value.trim() === '' ? '' : (n(value) * effectiveRate).toFixed(2))
  }

  function onAmount(value: string) {
    setAmount(value)
    setLitres(
      value.trim() === '' || effectiveRate <= 0
        ? ''
        : (n(value) / effectiveRate).toFixed(3),
    )
  }

  function onRate(value: string) {
    setRate(value)
    const r = value.trim() === '' ? (liveRate ?? 0) : n(value)
    if (litres.trim() !== '') setAmount((n(litres) * r).toFixed(2))
  }

  const newBalance = (customer?.balance ?? 0) + n(litres) * effectiveRate
  const overLimit =
    !!customer && customer.credit_limit > 0 && newBalance > customer.credit_limit

  return (
    <ActionForm action={createCreditSale}>
      <input type="hidden" name="sale_rate" value={effectiveRate} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.date')} required>
          <Input name="business_date" type="date" required defaultValue={date} />
        </Field>
        <Field label={t('credit.slipNo')} hint={t('common.optional')}>
          <Input name="slip_number" />
        </Field>
      </div>

      <Field label={t('cust.title')} required>
        <Select
          name="customer_id"
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">—</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      {customer ? (
        <Alert tone={overLimit ? 'danger' : 'accent'}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {t('cust.balance')}: <strong>{money(customer.balance)}</strong>
            </span>
            {customer.credit_limit > 0 ? (
              <span>
                {t('cust.creditLimit')}: <strong>{money(customer.credit_limit)}</strong>
              </span>
            ) : null}
            {overLimit ? <span className="font-semibold">{t('credit.overLimit')}</span> : null}
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('credit.vehicle')}>
          <Select name="vehicle_id" disabled={!customerId}>
            <option value="">—</option>
            {customerVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vehicle_number}
                {v.driver_name ? ` · ${v.driver_name}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={`${t('cust.vehicleNo')} (${t('common.optional')})`}
          hint="For a lorry not on their list"
        >
          <Input name="vehicle_number" className="uppercase tabular" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('credit.driver')}>
          <Input name="driver_name" />
        </Field>
        <Field label={t('credit.odometer')} hint={t('common.optional')}>
          <NumberInput name="odometer" step="0.1" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.fuel')} required>
          <Select
            name="fuel_type_id"
            required
            value={fuelId}
            onChange={(e) => {
              setFuelId(e.target.value)
              setRate('')
            }}
          >
            {fuels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('common.rate')}
          hint={liveRate ? `${t('set.currentRate')}: ₹${liveRate}` : undefined}
        >
          <NumberInput
            step="0.001"
            value={rate}
            placeholder={liveRate ? String(liveRate) : ''}
            onChange={(e) => onRate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.litres')} required>
          <NumberInput
            name="litres"
            step="0.001"
            required
            value={litres}
            onChange={(e) => onLitres(e.target.value)}
          />
        </Field>
        <Field label={t('common.amount')} hint="Type either one">
          <NumberInput
            step="0.01"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('shift.name')} hint={t('common.optional')}>
          <Select name="shift_id">
            <option value="">—</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('set.nozzles')} hint={t('common.optional')}>
          <Select name="nozzle_id">
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
        <Field label={t('shift.filler')} hint={t('common.optional')}>
          <Select name="staff_id">
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {effectiveRate <= 0 ? (
        <Alert tone="accent">{t('set.noRate')}</Alert>
      ) : null}

      <div className="flex items-center justify-between gap-4 rounded-lg border border-divider bg-neutral-200 px-4 py-3">
        <span className="font-medium">{t('common.total')}</span>
        <span className="tabular text-xl font-semibold">
          {money(n(litres) * effectiveRate)}
        </span>
      </div>

      <div>
        <SubmitButton>{t('common.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
