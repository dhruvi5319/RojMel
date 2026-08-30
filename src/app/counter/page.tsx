import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayIST } from '@/lib/format'
import type {
  FuelType, NozzleState, Shift, Staff, Vehicle,
} from '@/lib/database.types'
import { CounterApp, type CounterCustomer } from './CounterApp'

export const dynamic = 'force-dynamic'

export default async function CounterPage() {
  const { station, profile } = await requireSession()
  const supabase = await createClient()
  const today = todayIST()

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
      staff={(staffRes.data ?? []) as Staff[]}
      nozzles={(nozzlesRes.data ?? []) as NozzleState[]}
      fuels={(fuelsRes.data ?? []) as FuelType[]}
      customers={(customersRes.data ?? []) as CounterCustomer[]}
      vehicles={(vehiclesRes.data ?? []) as Vehicle[]}
      shifts={(shiftsRes.data ?? []) as Shift[]}
    />
  )
}
