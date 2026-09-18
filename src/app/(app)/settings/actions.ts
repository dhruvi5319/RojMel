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

/* ══════════════════════════════════════════════════════════════════════════
   The pump's equipment — fuels, tanks, nozzles. Owner-only to change, because
   editing one silently changes what every future reading means. Row level
   security says the same thing again in the database; these checks only make
   the refusal readable.
   ══════════════════════════════════════════════════════════════════════ */

async function ownerOnly(): Promise<FormState | null> {
  const session = await getSession()
  if (session?.profile.role !== 'owner') {
    return { error: 'Only an owner can change the pump\'s equipment.' }
  }
  return null
}

export async function updateFuelType(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const denied = await ownerOnly()
  if (denied) return denied

  const supabase = await createClient()
  const outcome = changed(
    await supabase
      .from('fuel_types')
      .update({
        name: String(data.get('name') ?? '').trim(),
        name_gu: String(data.get('name_gu') ?? '').trim() || null,
        sort_order: Number(data.get('sort_order') ?? 0),
        is_active: data.get('is_active') === 'on',
      })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this fuel',
  )
  if (outcome.error) return outcome
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function updateTank(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const denied = await ownerOnly()
  if (denied) return denied

  const supabase = await createClient()
  const outcome = changed(
    await supabase
      .from('tanks')
      .update({
        name: String(data.get('name') ?? '').trim(),
        capacity_litres: Number(data.get('capacity_litres') ?? 0),
        opening_stock_litres: Number(data.get('opening_stock_litres') ?? 0),
        opening_stock_date: String(data.get('opening_stock_date') ?? '') || null,
        is_active: data.get('is_active') === 'on',
      })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this tank',
  )
  if (outcome.error) return outcome
  revalidatePath('/settings')
  revalidatePath('/stock')
  return { ok: true }
}

export async function updateNozzle(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const denied = await ownerOnly()
  if (denied) return denied

  const supabase = await createClient()
  const outcome = changed(
    await supabase
      .from('nozzles')
      .update({
        name: String(data.get('name') ?? '').trim(),
        tank_id: String(data.get('tank_id')),
        sort_order: Number(data.get('sort_order') ?? 0),
        is_active: data.get('is_active') === 'on',
      })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this nozzle',
  )
  if (outcome.error) return outcome
  revalidatePath('/settings')
  revalidatePath('/shifts')
  return { ok: true }
}

/** Deleting is refused by a trigger once the thing has priced a sale. */
async function removeConfig(
  table: 'fuel_types' | 'tanks' | 'nozzles',
  data: FormData,
  subject: string,
): Promise<FormState> {
  const denied = await ownerOnly()
  if (denied) return denied

  const supabase = await createClient()
  const outcome = changed(
    await supabase.from(table).delete().eq('id', String(data.get('id'))).select('id'),
    subject,
  )
  if (outcome.error) return outcome
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function deleteFuelType(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  return removeConfig('fuel_types', data, 'this fuel')
}

export async function deleteTank(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  return removeConfig('tanks', data, 'this tank')
}

export async function deleteNozzle(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  return removeConfig('nozzles', data, 'this nozzle')
}
