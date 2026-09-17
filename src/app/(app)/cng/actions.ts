'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import { changed, friendly, type FormState } from '@/lib/actions'

/** Gujarat Gas bills the inlet in SCM; the pump sells kilograms. */
export async function recordSupply(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const session = await getSession()
  const scm = Number(data.get('scm_received'))
  if (!(scm >= 0)) return { error: 'Enter the standard cubic metres received.' }

  const num = (k: string) => (data.get(k) ? Number(data.get(k)) : null)

  const { data: row, error } = await supabase
    .from('cng_supply')
    .upsert(
      {
        supply_date: String(data.get('supply_date')),
        opening_scm: num('opening_scm'),
        closing_scm: num('closing_scm'),
        scm_received: scm,
        invoice_number: String(data.get('invoice_number') ?? '').trim() || null,
        notes: String(data.get('notes') ?? '').trim() || null,
      },
      { onConflict: 'station_id,supply_date' },
    )
    .select('id')
    .single()

  if (error) return { error: friendly(error) }

  // What the gas cost is margin, so only an owner may write it.
  const rate = Number(data.get('rate_per_scm') ?? 0)
  if (session?.profile.role === 'owner' && rate > 0) {
    const vatRate = Number(data.get('vat_rate') ?? 0)
    const basic = Number((scm * rate).toFixed(2))
    const vat = Number(((basic * vatRate) / 100).toFixed(2))

    const { error: costError } = await supabase.from('cng_supply_costs').upsert(
      {
        supply_id: row.id,
        supplier: String(data.get('supplier') ?? '').trim() || 'Gujarat Gas',
        rate_per_scm: rate,
        basic_amount: basic,
        vat_rate: vatRate || null,
        vat_amount: vat || null,
        amount: Number((basic + vat).toFixed(2)),
      },
      { onConflict: 'supply_id' },
    )
    if (costError) return { error: friendly(costError) }
  }

  revalidatePath('/cng')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteSupply(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const id = String(data.get('id'))
  // The cost row is owner-only, so a manager's delete would otherwise trip the
  // foreign key on a row she cannot see.
  await supabase.from('cng_supply_costs').delete().eq('supply_id', id)

  const outcome = changed(
    await supabase.from('cng_supply').delete().eq('id', id).select('id'),
    'this supply entry',
  )
  if (outcome.error) return outcome

  revalidatePath('/cng')
  revalidatePath('/')
  return { ok: true }
}

export async function addDispenser(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const name = String(data.get('name') ?? '').trim()
  if (!name) return { error: 'Name the dispenser.' }

  const { error } = await supabase.from('cng_dispensers').insert({
    name,
    fuel_type_id: String(data.get('fuel_type_id')),
    sort_order: Number(data.get('sort_order') ?? 0),
  })

  if (error) {
    return {
      error: error.code === '23505' ? 'That dispenser already exists.' : friendly(error),
    }
  }

  revalidatePath('/cng')
  revalidatePath('/shifts')
  return { ok: true }
}

export async function toggleDispenser(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase
      .from('cng_dispensers')
      .update({ is_active: data.get('active') === 'true' })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this dispenser',
  )
  if (outcome.error) return outcome

  revalidatePath('/cng')
  revalidatePath('/shifts')
  return { ok: true }
}
