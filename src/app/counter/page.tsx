import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { businessDateAt, shiftAt } from '@/lib/shifts'
import type {
  FuelType, NozzleState, Shift, Staff, Vehicle,
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
    />
  )
}
