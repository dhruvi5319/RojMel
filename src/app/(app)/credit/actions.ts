'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { changed, friendly, type FormState } from '@/lib/actions'

export async function createCreditSale(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()

  const litres = Number(data.get('litres'))
  const sale_rate = Number(data.get('sale_rate'))
  if (!(litres > 0)) return { error: 'Enter how many litres went out.' }
  if (!(sale_rate > 0)) return { error: 'Enter the rate per litre.' }

  const vehicle_id = String(data.get('vehicle_id') ?? '') || null
  let vehicle_number = String(data.get('vehicle_number') ?? '').trim()

  // Keep a snapshot of the number on the slip: vehicles get reassigned, and a
  // slip from last March should still say which lorry took the diesel.
  if (vehicle_id && !vehicle_number) {
    const { data: v } = await supabase
      .from('vehicles')
      .select('vehicle_number')
      .eq('id', vehicle_id)
      .maybeSingle<{ vehicle_number: string }>()
    vehicle_number = v?.vehicle_number ?? ''
  }

  const { error } = await supabase.from('credit_sales').insert({
    business_date: String(data.get('business_date')),
    customer_id: String(data.get('customer_id')),
    vehicle_id,
    vehicle_number: vehicle_number.toUpperCase().replace(/\s+/g, '') || null,
    fuel_type_id: String(data.get('fuel_type_id')),
    nozzle_id: String(data.get('nozzle_id') ?? '') || null,
    shift_id: String(data.get('shift_id') ?? '') || null,
    staff_id: String(data.get('staff_id') ?? '') || null,
    slip_number: String(data.get('slip_number') ?? '').trim() || null,
    driver_name: String(data.get('driver_name') ?? '').trim() || null,
    odometer: data.get('odometer') ? Number(data.get('odometer')) : null,
    litres,
    sale_rate,
  })

  if (error) return { error: friendly(error) }

  revalidatePath('/credit')
  revalidatePath('/customers')
  revalidatePath('/')

  if (data.get('another') === 'yes') return { ok: true }
  redirect(`/credit?date=${String(data.get('business_date'))}`)
}

export async function deleteCreditSale(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase.from('credit_sales').delete()
      .eq('id', String(formData.get('id')))
      .is('invoice_id', null)
      .select('id'),
    'this slip',
  )
  if (outcome.error) return outcome
  revalidatePath('/credit')
  revalidatePath('/customers')
  revalidatePath('/')
  return { ok: true }
}

export async function updateCreditSale(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const litres = Number(data.get('litres'))
  const sale_rate = Number(data.get('sale_rate'))
  if (!(litres > 0)) return { error: 'Enter how many litres went out.' }
  if (!(sale_rate > 0)) return { error: 'Enter the rate per litre.' }

  const outcome = changed(
    await supabase
      .from('credit_sales')
      .update({
        business_date: String(data.get('business_date')),
        litres,
        sale_rate,
        vehicle_number:
          String(data.get('vehicle_number') ?? '').trim().toUpperCase() || null,
        driver_name: String(data.get('driver_name') ?? '').trim() || null,
        slip_number: String(data.get('slip_number') ?? '').trim() || null,
      })
      .eq('id', String(data.get('id')))
      // A slip already on an invoice must not change under the customer's bill.
      .is('invoice_id', null)
      .select('id'),
    'this slip (a billed slip cannot be changed — cancel the invoice first)',
  )
  if (outcome.error) return outcome

  revalidatePath('/credit')
  revalidatePath('/customers')
  revalidatePath('/')
  return { ok: true }
}
