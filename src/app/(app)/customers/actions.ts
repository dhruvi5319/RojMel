'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { changed, friendly, type FormState } from '@/lib/actions'

const text = (d: FormData, k: string) => {
  const v = String(d.get(k) ?? '').trim()
  return v === '' ? null : v
}
const number = (d: FormData, k: string) => {
  const v = String(d.get(k) ?? '').trim()
  return v === '' ? 0 : Number(v)
}

export async function createCustomer(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const name = text(data, 'name')
  if (!name) return { error: 'Name is required.' }

  const { data: row, error } = await supabase
    .from('customers')
    .insert({
      name,
      contact_person: text(data, 'contact_person'),
      phone: text(data, 'phone'),
      email: text(data, 'email'),
      address: text(data, 'address'),
      gstin: text(data, 'gstin'),
      credit_limit: number(data, 'credit_limit'),
      opening_balance: number(data, 'opening_balance'),
      opening_balance_date: text(data, 'opening_balance_date'),
      notes: text(data, 'notes'),
    })
    .select('id')
    .single()

  if (error) {
    return {
      error: error.code === '23505'
        ? 'A customer with this name already exists.'
        : friendly(error),
    }
  }

  revalidatePath('/customers')
  redirect(`/customers/${row.id}`)
}

export async function updateCustomer(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const id = String(data.get('id'))

  const result = await supabase
    .from('customers')
    .update({
      name: text(data, 'name'),
      contact_person: text(data, 'contact_person'),
      phone: text(data, 'phone'),
      email: text(data, 'email'),
      address: text(data, 'address'),
      gstin: text(data, 'gstin'),
      credit_limit: number(data, 'credit_limit'),
      opening_balance: number(data, 'opening_balance'),
      opening_balance_date: text(data, 'opening_balance_date'),
      notes: text(data, 'notes'),
      is_active: data.get('is_active') === 'on',
    })
    .eq('id', id)
    .select('id')

  const outcome = changed(result, 'this customer')
  if (outcome.error) return outcome

  revalidatePath('/customers')
  revalidatePath(`/customers/${id}`)
  return { ok: true }
}

export async function addVehicle(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const customer_id = String(data.get('customer_id'))
  const vehicle_number = text(data, 'vehicle_number')
  if (!vehicle_number) return { error: 'Vehicle number is required.' }

  const { error } = await supabase.from('vehicles').insert({
    customer_id,
    vehicle_number: vehicle_number.toUpperCase().replace(/\s+/g, ''),
    driver_name: text(data, 'driver_name'),
  })

  if (error) {
    return {
      error: error.code === '23505'
        ? 'That vehicle number is already registered at this pump.'
        : friendly(error),
    }
  }

  revalidatePath(`/customers/${customer_id}`)
  return { ok: true }
}

export async function removeVehicle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const id = String(formData.get('id'))
  const customer_id = String(formData.get('customer_id'))

  const outcome = changed(
    await supabase.from('vehicles').update({ is_active: false }).eq('id', id).select('id'),
    'this vehicle',
  )
  if (outcome.error) return outcome

  revalidatePath(`/customers/${customer_id}`)
  return { ok: true }
}
