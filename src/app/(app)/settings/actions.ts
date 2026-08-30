'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { changed, friendly, type FormState } from '@/lib/actions'
import { getSession } from '@/lib/auth'

const text = (d: FormData, k: string) => String(d.get(k) ?? '').trim() || null

export async function updateStation(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const name = String(data.get('name') ?? '').trim()
  if (!name) return { error: 'The pump needs a name.' }

  // Only an owner may change the pump's own details. Say so plainly instead of
  // letting row level security quietly match no rows.
  const session = await getSession()
  if (session?.profile.role !== 'owner') {
    return { error: 'Only an owner can change the pump details.' }
  }

  const result = await supabase
    .from('stations')
    .update({
      name,
      legal_name: text(data, 'legal_name'),
      address: text(data, 'address'),
      city: text(data, 'city'),
      state: text(data, 'state'),
      pincode: text(data, 'pincode'),
      gstin: text(data, 'gstin'),
      phone: text(data, 'phone'),
      invoice_prefix: String(data.get('invoice_prefix') ?? 'INV').trim() || 'INV',
    })
    .eq('id', String(data.get('id')))
    .select('id')

  const outcome = changed(result, 'the pump details')
  if (outcome.error) return outcome

  // The name is drawn in the layout header, so the whole tree must revalidate.
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function addFuelType(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const name = String(data.get('name') ?? '').trim()
  if (!name) return { error: 'Name the fuel.' }

  const rate = Number(data.get('sale_rate') ?? 0)

  const { data: fuel, error } = await supabase
    .from('fuel_types')
    .insert({
      name,
      name_gu: text(data, 'name_gu'),
      sort_order: Number(data.get('sort_order') ?? 0),
    })
    .select('id')
    .single()

  if (error) {
    return {
      error: error.code === '23505' ? 'That fuel already exists.' : friendly(error),
    }
  }

  if (rate > 0) {
    await supabase.from('fuel_prices').insert({ fuel_type_id: fuel.id, sale_rate: rate })
  }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Rates are never overwritten — a new row is added with its own effective
 * time, so a slip written last Tuesday still prices at last Tuesday's rate.
 */
export async function setRate(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const sale_rate = Number(data.get('sale_rate'))
  if (!(sale_rate > 0)) return { error: 'Enter the new rate per litre.' }

  const effective = String(data.get('effective_from') ?? '').trim()

  const { error } = await supabase.from('fuel_prices').insert({
    fuel_type_id: String(data.get('fuel_type_id')),
    sale_rate,
    effective_from: effective ? new Date(effective).toISOString() : new Date().toISOString(),
  })

  if (error) return { error: friendly(error) }
  revalidatePath('/settings')
  revalidatePath('/shifts')
  return { ok: true }
}

export async function addTank(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const name = String(data.get('name') ?? '').trim()
  if (!name) return { error: 'Name the tank.' }

  const { error } = await supabase.from('tanks').insert({
    name,
    fuel_type_id: String(data.get('fuel_type_id')),
    capacity_litres: Number(data.get('capacity_litres') ?? 0),
    opening_stock_litres: Number(data.get('opening_stock_litres') ?? 0),
    opening_stock_date: String(data.get('opening_stock_date') ?? '') || null,
  })

  if (error) {
    return { error: error.code === '23505' ? 'That tank already exists.' : friendly(error) }
  }
  revalidatePath('/settings')
  revalidatePath('/stock')
  return { ok: true }
}

export async function addNozzle(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const name = String(data.get('name') ?? '').trim()
  const tank_id = String(data.get('tank_id'))
  if (!name) return { error: 'Name the nozzle.' }

  const { data: tank } = await supabase
    .from('tanks')
    .select('fuel_type_id')
    .eq('id', tank_id)
    .maybeSingle<{ fuel_type_id: string }>()

  if (!tank) return { error: 'Choose a tank.' }

  const { error } = await supabase.from('nozzles').insert({
    name,
    tank_id,
    fuel_type_id: tank.fuel_type_id,
    sort_order: Number(data.get('sort_order') ?? 0),
  })

  if (error) {
    return { error: error.code === '23505' ? 'That nozzle already exists.' : friendly(error) }
  }
  revalidatePath('/settings')
  revalidatePath('/shifts')
  return { ok: true }
}

export async function toggleNozzle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase
      .from('nozzles')
      .update({ is_active: formData.get('active') === 'true' })
      .eq('id', String(formData.get('id')))
      .select('id'),
    'this nozzle',
  )
  if (outcome.error) return outcome
  revalidatePath('/settings')
  revalidatePath('/shifts')
  return { ok: true }
}
