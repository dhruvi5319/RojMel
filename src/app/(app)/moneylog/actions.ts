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
