'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface CounterResult {
  error?: string
  ok?: boolean
}

/** An udhaar slip written at the pump, by whoever is on the nozzle. */
export async function counterSlip(input: {
  customer_id: string
  vehicle_id: string | null
  fuel_type_id: string
  nozzle_id: string | null
  staff_id: string | null
  litres: number
  sale_rate: number
  slip_number: string | null
  driver_name: string | null
  business_date: string
}): Promise<CounterResult> {
  const supabase = await createClient()

  if (!(input.litres > 0)) return { error: 'Enter the litres.' }
  if (!(input.sale_rate > 0)) return { error: 'No rate set for this fuel.' }

  let vehicle_number: string | null = null
  if (input.vehicle_id) {
    const { data } = await supabase
      .from('vehicles')
      .select('vehicle_number')
      .eq('id', input.vehicle_id)
      .maybeSingle<{ vehicle_number: string }>()
    vehicle_number = data?.vehicle_number ?? null
  }

  const { error } = await supabase.from('credit_sales').insert({
    ...input,
    vehicle_number,
  })

  if (error) return { error: error.message }

  revalidatePath('/credit')
  revalidatePath('/')
  return { ok: true }
}

/** Opening/closing meter for one nozzle, against today's open shift. */
export async function counterReading(input: {
  shift_id: string
  nozzle_id: string
  staff_id: string | null
  opening_reading: number
  closing_reading: number
  test_litres: number
  sale_rate: number
}): Promise<CounterResult> {
  const supabase = await createClient()

  if (input.closing_reading < input.opening_reading) {
    return { error: 'The closing reading cannot be less than the opening one.' }
  }

  const { error } = await supabase
    .from('nozzle_readings')
    .upsert(input, { onConflict: 'shift_id,nozzle_id' })

  if (error) return { error: error.message }

  revalidatePath('/shifts')
  revalidatePath('/')
  return { ok: true }
}

/** Opens today's shift if nobody has yet, so the filler is never blocked. */
export async function ensureShift(name: string, sortOrder: number, date: string) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('shifts')
    .select('id')
    .eq('business_date', date)
    .eq('name', name)
    .maybeSingle<{ id: string }>()

  if (existing) return { id: existing.id }

  const { data, error } = await supabase
    .from('shifts')
    .insert({ business_date: date, name, sort_order: sortOrder })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}
