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
  quantity: number
  sale_rate: number
  slip_number: string | null
  driver_name: string | null
  business_date: string
  /** The shift the filler said they were standing in. */
  shift_id: string
}): Promise<CounterResult> {
  const supabase = await createClient()

  if (!(input.quantity > 0)) return { error: 'Enter how much fuel went out.' }
  if (!(input.sale_rate > 0)) return { error: 'No rate set for this fuel.' }
  if (!input.shift_id) return { error: 'Say which shift this slip was written in.' }

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

/**
 * The filler says their shift is finished.
 *
 * Closing it is theirs to do: they are the one who handed the money over, and
 * a shift left open until the office noticed was a shift nobody had signed.
 * The figures stay theirs to correct until an owner or manager approves it.
 */
export async function closeMyShift(shiftId: string): Promise<CounterResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_shift', { p_shift_id: shiftId })
  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/shifts')
  return { ok: true }
}

/** Reopening it to fix something, while the books have not yet agreed it. */
export async function reopenMyShift(shiftId: string): Promise<CounterResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reopen_shift', { p_shift_id: shiftId })
  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/shifts')
  return { ok: true }
}
