'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { friendly, type FormState } from '@/lib/actions'

/**
 * Write the shift's own difference down, with whatever was said about it.
 *
 * The figure is recomputed in the database from the readings and the takings,
 * so what gets stored can never drift from what it was calculated off.
 */
export async function recordVariance(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('record_shift_variance', {
    p_shift_id: String(data.get('shift_id')),
    p_note: String(data.get('note') ?? '').trim() || null,
  })

  if (error) return { error: friendly(error) }

  revalidatePath('/moneylog')
  revalidatePath('/shifts')
  return { ok: true }
}

/**
 * The shift's takings, entered where the book records them.
 *
 * This writes the row with no filler against it — the shift's money as a
 * whole. Anything already handed over by a named filler on the shift screen
 * stays as it is and is counted alongside, so neither way of working
 * overwrites the other.
 */
export async function saveShiftMoney(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const num = (k: string) => {
    const v = String(data.get(k) ?? '').trim()
    return v === '' ? 0 : Number(v)
  }

  const { error } = await supabase.from('shift_collections').upsert(
    {
      shift_id: String(data.get('shift_id')),
      staff_id: null,
      cash_amount: num('cash'),
      card_amount: num('card'),
      upi_amount: num('upi'),
      bpcl_amount: num('bpcl'),
    },
    { onConflict: 'shift_id,staff_id' },
  )

  if (error) return { error: friendly(error) }

  revalidatePath('/moneylog')
  revalidatePath('/shifts')
  revalidatePath('/daybook')
  revalidatePath('/')
  return { ok: true }
}
