import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { businessDateAt, shiftAt } from '@/lib/shifts'
import type {
  FuelType, NozzleState, Shift, ShiftFiller, ShiftMeter, Staff, Vehicle,
} from '@/lib/database.types'
import { CounterApp, type CounterCustomer } from './CounterApp'

export const dynamic = 'force-dynamic'

export default async function CounterPage() {
  const { station, profile } = await requireSession()
  const supabase = await createClient()
  /*
   * The clock decides, not the person holding the device. The day shift runs
   * 7am to 7pm and the night 7pm to 7am, and the pump's working day rolls at
   * 7am too — so at 2am the forecourt is still on last evening's night shift
   * and what it sells belongs to that day's book.
   */
  const now = new Date()
  const shiftNow = shiftAt(now)
  const today = businessDateAt(now)

  const [staffRes, nozzlesRes, fuelsRes, customersRes, vehiclesRes, shiftsRes] =
    await Promise.all([
      supabase.from('staff').select('*').eq('is_active', true).order('name'),
      supabase.from('v_nozzle_state').select('*').order('sort_order'),
      supabase.from('fuel_types').select('*').eq('is_active', true).order('sort_order'),
      // The counter's RLS returns nothing from the balances view, so it falls
      // back to plain customer rows and simply shows no money.
      supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('vehicles').select('*').eq('is_active', true).order('vehicle_number'),
      supabase.from('shifts').select('*').eq('business_date', today).order('sort_order'),
    ])

  // The shift being worked, and the two things that hang off it: every meter
  // on the forecourt, and who is standing there.
  const shift = (shiftsRes.data ?? []).find(
    (s) => (s as Shift).name === shiftNow.name,
  ) as Shift | undefined

  const [metersRes, fillersRes, readRes, cngRes, slipsRes] = shift
    ? await Promise.all([
        // In the order somebody walks the forecourt: the pumps, then the
        // CNG island. ('nozzle' sorts after 'cng', hence descending.)
        supabase.from('v_shift_meters').select('*').eq('shift_id', shift.id)
          .order('kind', { ascending: false }).order('sort_order'),
        supabase.from('v_shift_fillers').select('*').eq('shift_id', shift.id).order('name'),
        supabase.from('nozzle_readings').select('amount').eq('shift_id', shift.id),
        supabase.from('cng_readings').select('amount').eq('shift_id', shift.id),
        supabase.from('credit_sales').select('amount').eq('shift_id', shift.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((t, r) => t + Number(r.amount), 0)

  // What the filler needs at handover: what the meters say went out, what of
  // it went on udhaar, and so what cash is owed.
  const sold = sum(readRes.data as { amount: number }[]) +
    sum(cngRes.data as { amount: number }[])
  const udhaar = sum(slipsRes.data as { amount: number }[])

  return (
    <CounterApp
      stationName={station.name}
      role={profile.role}
      today={today}
      shiftNow={{ name: shiftNow.name, order: shiftNow.order }}
      staff={(staffRes.data ?? []) as Staff[]}
      nozzles={(nozzlesRes.data ?? []) as NozzleState[]}
      fuels={(fuelsRes.data ?? []) as FuelType[]}
      customers={(customersRes.data ?? []) as CounterCustomer[]}
      vehicles={(vehiclesRes.data ?? []) as Vehicle[]}
      shifts={(shiftsRes.data ?? []) as Shift[]}
      meters={(metersRes.data ?? []) as ShiftMeter[]}
      fillers={(fillersRes.data ?? []) as ShiftFiller[]}
      hissab={{ sold, udhaar, cash: sold - udhaar }}
    />
  )
}
