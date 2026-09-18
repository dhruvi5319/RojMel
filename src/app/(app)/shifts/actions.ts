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

/** CNG is metered in kilograms, but it closes with the same shift. */
export interface CngReadingInput {
  dispenser_id: string
  staff_id: string | null
  opening_reading: number
  closing_reading: number
  test_kg: number
  sale_rate: number
}

/** What a filler hands over: notes. The account-settled modes belong to the
 *  shift and are entered on the money log. */
export interface CollectionInput {
  staff_id: string
  cash_amount: number
}

/**
 * Saves the whole shift in one go. Readings and handover are upserted, and
 * rows the user blanked out are removed, so re-saving is always idempotent.
 */
export async function saveShift(
  shiftId: string,
  readings: ReadingInput[],
  collections: CollectionInput[],
  cng: CngReadingInput[] = [],
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

  const keepColl = collections.filter((c) => c.cash_amount > 0)

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

  // CNG dispensers, counted in kilograms against the same shift.
  const keepCng = cng.filter((c) => c.closing_reading > 0 || c.opening_reading > 0)
  if (keepCng.length > 0) {
    const { error } = await supabase
      .from('cng_readings')
      .upsert(
        keepCng.map((c) => ({ ...c, shift_id: shiftId })),
        { onConflict: 'shift_id,dispenser_id' },
      )
    if (error) return { error: friendly(error) }
  }

  const dropCng = cng.filter((c) => !keepCng.includes(c)).map((c) => c.dispenser_id)
  if (dropCng.length > 0) {
    await supabase
      .from('cng_readings')
      .delete()
      .eq('shift_id', shiftId)
      .in('dispenser_id', dropCng)
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

/**
 * The office takes the shift's figures as true.
 *
 * Until this, the filler may keep correcting their own readings and handover —
 * a mistyped meter is theirs to fix, not something to be argued about in the
 * office. Approving draws the line: from here only the office can reopen it.
 */
export async function approveShift(shiftId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_shift', { p_shift_id: shiftId })
  if (error) return { error: friendly(error) }
  revalidatePath(`/shifts/${shiftId}`)
  revalidatePath('/shifts')
  revalidatePath('/moneylog')
  return {}
}

/** Reopening it — the office may, whether or not it was approved. */
export async function reopenShift(shiftId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reopen_shift', { p_shift_id: shiftId })
  if (error) return { error: friendly(error) }
  revalidatePath(`/shifts/${shiftId}`)
  revalidatePath('/shifts')
  revalidatePath('/moneylog')
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
