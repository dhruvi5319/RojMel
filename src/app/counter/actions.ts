'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { changed } from '@/lib/actions'

export interface CounterResult {
  error?: string
  ok?: boolean
}

/**
 * The shift begins because somebody pressed start.
 *
 * Not because the clock turned seven and not because the first slip of the
 * evening needed somewhere to go. The hour it really began and the filler who
 * began it are written down, and who is standing there is settled in the same
 * breath — which is when the people on the forecourt know it.
 */
export async function startShift(input: {
  name: string
  date: string
  staffId: string | null
  fillerIds: string[]
}): Promise<CounterResult & { id?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('start_shift', {
      p_name: input.name,
      p_date: input.date,
      p_staff_id: input.staffId,
      p_fillers: input.fillerIds,
    })
    .single<{ id: string }>()

  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/shifts')
  return { ok: true, id: data?.id }
}

/**
 * The shift is finished.
 *
 * The device is shared by everyone on the shift, so this is not one person
 * saying they are going home: it is the shift being handed in. The name is
 * recorded because the book should say who handed it over, not because the
 * shift belonged to them. The figures stay correctable until the office
 * approves it.
 */
export async function finishShift(
  shiftId: string,
  staffId: string | null = null,
): Promise<CounterResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_shift', {
    p_shift_id: shiftId,
    p_staff_id: staffId,
  })
  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/shifts')
  return { ok: true }
}

/** Reopening it to fix something, while the books have not yet agreed it. */
export async function reopenShift(shiftId: string): Promise<CounterResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reopen_shift', { p_shift_id: shiftId })
  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/shifts')
  return { ok: true }
}

/**
 * The meter reading — the shift finishing writes what the pump shows now,
 * as its own closing. It never touches any other shift: the one after it
 * inherits this automatically, the moment it is started, so the filler
 * going off does not have to wait for whoever comes on next.
 */
export async function saveMeterReading(
  shiftId: string,
  nozzles: { nozzle_id: string; reading: string }[],
  cng: { dispenser_id: string; reading: string }[],
  staffId: string | null = null,
): Promise<CounterResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_shift_closing', {
    p_shift_id: shiftId,
    p_nozzles: nozzles.filter((n) => n.reading.trim() !== ''),
    p_cng: cng.filter((c) => c.reading.trim() !== ''),
    p_staff_id: staffId,
  })
  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/shifts')
  return { ok: true }
}

/**
 * The cash each filler handed over, counted note by note where it was
 * counted.
 *
 * Cash and nothing else: the card machine and the UPI account are the pump's,
 * not the person's, and the office enters those on the money log. The total
 * is not typed — record_shift_cash_count() adds up what was actually
 * counted, so it can never be a number nobody's notes and coins add to.
 */
export async function saveCashCount(
  shiftId: string,
  counts: {
    staff_id: string
    denominations: { denomination: number; count: number }[]
  }[],
): Promise<CounterResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_shift_cash_count', {
    p_shift_id: shiftId,
    p_counts: counts.filter((c) => c.denominations.length > 0),
  })
  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/moneylog')
  revalidatePath('/shifts')
  return { ok: true }
}

/**
 * The card machine and the UPI QR are shared, not any one filler's, so this
 * is the shift's own figure rather than counted per person — but whoever is
 * actually swiping the card or showing the QR knows it as it happens, and
 * "what's owed" cannot subtract what it does not know about. Writes the same
 * row the money log's own form does (shift_id, staff_id null), so whichever
 * is entered first the other only ever confirms or corrects, never doubles.
 */
export async function saveShiftPayments(
  shiftId: string,
  payments: { card: number; upi: number; bpcl: number },
): Promise<CounterResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('shift_collections').upsert(
    {
      shift_id: shiftId,
      staff_id: null,
      card_amount: payments.card,
      upi_amount: payments.upi,
      bpcl_amount: payments.bpcl,
    },
    { onConflict: 'shift_id,staff_id' },
  )
  if (error) return { error: error.message }
  revalidatePath('/counter')
  revalidatePath('/moneylog')
  revalidatePath('/shifts')
  return { ok: true }
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
  if (!input.shift_id) return { error: 'Start the shift before writing a slip.' }

  const { error } = await supabase.from('credit_sales').insert({
    ...input,
    vehicle_number: await vehicleNumber(input.vehicle_id),
  })

  if (error) return { error: error.message }

  revalidatePath('/counter')
  revalidatePath('/credit')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Putting right a slip that was written wrong.
 *
 * The filler who wrote it sees the mistake straight away, and it is theirs to
 * correct while the shift is still theirs. Past the office's agreement, and
 * past a bill, it is not — and row level security answers that by changing
 * nothing, so the result is checked rather than assumed.
 */
export async function updateSlip(
  id: string,
  patch: {
    customer_id: string
    vehicle_id: string | null
    fuel_type_id: string
    quantity: number
    sale_rate: number
    slip_number: string | null
    driver_name: string | null
    staff_id: string | null
  },
): Promise<CounterResult> {
  const supabase = await createClient()

  if (!(patch.quantity > 0)) return { error: 'Enter how much fuel went out.' }

  const result = await supabase
    .from('credit_sales')
    .update({ ...patch, vehicle_number: await vehicleNumber(patch.vehicle_id) })
    .eq('id', id)
    .select('id')

  const state = changed(result, 'this slip')
  if (state.error) return state

  revalidatePath('/counter')
  revalidatePath('/credit')
  return { ok: true }
}

/** Somebody has come in for a colleague who could not. */
export async function addFillerToShift(
  shiftId: string,
  staffId: string,
): Promise<CounterResult> {
  const supabase = await createClient()
  // Anyone added on the device is standing in: the rostered fillers were put
  // there by the trigger when the shift opened.
  const { error } = await supabase
    .from('shift_fillers')
    .insert({ shift_id: shiftId, staff_id: staffId, covering: true })
  if (error) return { error: error.message }
  revalidatePath('/counter')
  return { ok: true }
}

/** And somebody who is not here after all. */
export async function removeFillerFromShift(
  shiftId: string,
  staffId: string,
): Promise<CounterResult> {
  const supabase = await createClient()
  const result = await supabase
    .from('shift_fillers')
    .delete()
    .eq('shift_id', shiftId)
    .eq('staff_id', staffId)
    .select('staff_id')

  const state = changed(result, 'who is on this shift')
  if (state.error) return state

  revalidatePath('/counter')
  return { ok: true }
}

/** The number painted on the lorry, kept on the slip as it was that day. */
async function vehicleNumber(vehicleId: string | null): Promise<string | null> {
  if (!vehicleId) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('vehicles')
    .select('vehicle_number')
    .eq('id', vehicleId)
    .maybeSingle<{ vehicle_number: string }>()
  return data?.vehicle_number ?? null
}
