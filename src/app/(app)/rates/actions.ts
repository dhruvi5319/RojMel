'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { friendly, type FormState } from '@/lib/actions'

/**
 * Today's rate for one fuel.
 *
 * Everything downstream hangs off this number: litres off the meter times the
 * rate is the day's sale, and the day's sale minus udhaar is the cash the
 * fillers owe. So it is set once, for the whole pump, and never per nozzle —
 * two nozzles disagreeing would make a filler look short when the real fault
 * was a typo.
 *
 * Rates are append-only. Changing one inserts a new row with its own
 * effective_from, so a slip written this morning keeps this morning's price.
 */
export async function setTodaysRate(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const sale_rate = Number(data.get('sale_rate'))
  if (!(sale_rate > 0)) return { error: 'Enter the new rate.' }

  const { error } = await supabase.from('fuel_prices').insert({
    fuel_type_id: String(data.get('fuel_type_id')),
    sale_rate,
  })

  if (error) return { error: friendly(error) }

  // The rate reaches the dashboard, the shift form and every slip form, so the
  // whole tree revalidates.
  revalidatePath('/', 'layout')
  return { ok: true }
}
