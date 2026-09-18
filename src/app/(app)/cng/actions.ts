'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import { changed, friendly, type FormState } from '@/lib/actions'

/**
 * CNG comes on its own truck, and what it drops is kilograms — the same unit
 * the dispensers sell in, so a short delivery is arithmetic and the day needs
 * no conversion. A truck can come twice in a day, so each trip is its own row.
 */
export async function recordSupply(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const session = await getSession()
  const kg = Number(data.get('kg_received'))
  if (!(kg >= 0)) return { error: 'Enter how many kilograms the truck dropped.' }

  const num = (k: string) => (data.get(k) ? Number(data.get(k)) : null)
  const id = String(data.get('id') ?? '')

  const row = { 
        supply_date: String(data.get('supply_date')),
        tanker_number: String(data.get('tanker_number') ?? '').trim() || null,
        invoice_kg: num('invoice_kg'),
        kg_received: kg,
        received_by: String(data.get('received_by') ?? '') || null,
        invoice_number: String(data.get('invoice_number') ?? '').trim() || null,
        notes: String(data.get('notes') ?? '').trim() || null,
  }

  const { data: saved, error } = id
    ? await supabase.from('cng_supply').update(row).eq('id', id).select('id').single()
    : await supabase.from('cng_supply').insert(row).select('id').single()

  if (error) return { error: friendly(error) }
  if (!saved) {
    return { error: 'Nothing was changed. The delivery may have been removed.' }
  }

  // What the gas cost is margin, so only an owner may write it — and the
  // arithmetic is the database's, the same function the tanker's invoice uses.
  // The basic amount is copied off the paper, not worked out from the rate.
  const basic = Number(data.get('basic') ?? 0)
  if (session?.profile.role === 'owner' && basic > 0) {
    const { error: costError } = await supabase.rpc('record_cng_invoice', {
      p_supply_id: saved.id,
      p_quantity_kg: kg,
      p_rate_per_kg: num('rate_per_kg'),
      p_basic: basic,
      p_delivery_charge: num('delivery_charge') ?? 0,
      p_vat_rate: num('vat_rate'),
      p_cess_rate: num('cess_rate'),
      p_supplier: String(data.get('supplier') ?? '').trim() || null,
    })
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
