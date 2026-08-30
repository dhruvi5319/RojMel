'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

import { changed, friendly, type FormState } from '@/lib/actions'

export type ActionResult = FormState

export async function openShift(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const business_date = String(formData.get('business_date'))
  const name = String(formData.get('name'))
  const sort_order = Number(formData.get('sort_order') ?? 0)

  const { data, error } = await supabase
    .from('shifts')
    .insert({ business_date, name, sort_order })
    .select('id')
    .single()

  if (error) {
    return {
      error: error.code === '23505'
        ? `A ${name} shift already exists for this date.`
        : friendly(error),
    }
  }

  revalidatePath('/shifts')
  redirect(`/shifts/${data.id}`)
}

export interface ReadingInput {
  nozzle_id: string
  staff_id: string | null
  opening_reading: number
  closing_reading: number
  test_litres: number
  sale_rate: number
}

export interface CollectionInput {
  staff_id: string
  cash_amount: number
  upi_amount: number
  card_amount: number
}

/**
 * Saves the whole shift in one go. Readings and handover are upserted, and
 * rows the user blanked out are removed, so re-saving is always idempotent.
 */
export async function saveShift(
  shiftId: string,
  readings: ReadingInput[],
  collections: CollectionInput[],
): Promise<ActionResult> {
  const supabase = await createClient()

  const keep = readings.filter((r) => r.closing_reading > 0 || r.opening_reading > 0)

  if (keep.length > 0) {
    const { error } = await supabase.from('nozzle_readings').upsert(
      keep.map((r) => ({ ...r, shift_id: shiftId })),
      { onConflict: 'shift_id,nozzle_id' },
    )
    if (error) return { error: friendly(error) }
  }

  const drop = readings.filter((r) => !keep.includes(r)).map((r) => r.nozzle_id)
  if (drop.length > 0) {
    await supabase
      .from('nozzle_readings')
      .delete()
      .eq('shift_id', shiftId)
      .in('nozzle_id', drop)
  }

  const keepColl = collections.filter(
    (c) => c.cash_amount > 0 || c.upi_amount > 0 || c.card_amount > 0,
  )

  if (keepColl.length > 0) {
    const { error } = await supabase.from('shift_collections').upsert(
      keepColl.map((c) => ({ ...c, shift_id: shiftId })),
      { onConflict: 'shift_id,staff_id' },
    )
    if (error) return { error: friendly(error) }
  }

  const dropColl = collections
    .filter((c) => !keepColl.includes(c))
    .map((c) => c.staff_id)
  if (dropColl.length > 0) {
    await supabase
      .from('shift_collections')
      .delete()
      .eq('shift_id', shiftId)
      .in('staff_id', dropColl)
  }

  revalidatePath(`/shifts/${shiftId}`)
  revalidatePath('/shifts')
  revalidatePath('/')
  return {}
}

export async function setShiftStatus(
  shiftId: string,
  status: 'open' | 'submitted',
): Promise<ActionResult> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase
      .from('shifts')
      .update({ status, closed_at: status === 'submitted' ? new Date().toISOString() : null })
      .eq('id', shiftId)
      .select('id'),
    'this shift',
  )
  if (outcome.error) return outcome
  revalidatePath(`/shifts/${shiftId}`)
  revalidatePath('/shifts')
  return {}
}

export async function deleteShift(shiftId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase.from('shifts').delete().eq('id', shiftId).select('id'),
    'this shift',
  )
  if (outcome.error) return outcome
  revalidatePath('/shifts')
  redirect('/shifts')
}
