'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import { changed, friendly, type FormState } from '@/lib/actions'

export async function recordDelivery(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const session = await getSession()
  const litres = Number(data.get('litres'))
  if (!(litres > 0)) return { error: 'Enter how many litres were delivered.' }

  const tank_id = String(data.get('tank_id'))
  const { data: tank } = await supabase
    .from('tanks')
    .select('fuel_type_id')
    .eq('id', tank_id)
    .maybeSingle<{ fuel_type_id: string }>()

  if (!tank) return { error: 'Choose a tank.' }

  const { data: purchase, error } = await supabase
    .from('fuel_purchases')
    .insert({
      tank_id,
      fuel_type_id: tank.fuel_type_id,
      delivery_date: String(data.get('delivery_date')),
      tanker_number: String(data.get('tanker_number') ?? '').trim() || null,
      litres,
      density: data.get('density') ? Number(data.get('density')) : null,
      received_by: String(data.get('received_by') ?? '') || null,
      notes: String(data.get('notes') ?? '').trim() || null,
    })
    .select('id')
    .single()

  if (error) return { error: friendly(error) }

  // Only an owner may write the cost side; RLS would reject it anyway, so the
  // manager's form simply never sends these fields.
  const rate = Number(data.get('rate_per_litre') ?? 0)
  if (session?.profile.role === 'owner' && rate > 0) {
    const { error: costError } = await supabase.from('fuel_purchase_costs').insert({
      purchase_id: purchase.id,
      supplier: String(data.get('supplier') ?? '').trim() || null,
      invoice_number: String(data.get('invoice_number') ?? '').trim() || null,
      invoice_date: String(data.get('invoice_date') ?? '') || null,
      rate_per_litre: rate,
      amount: Number((litres * rate).toFixed(2)),
    })
    if (costError) return { error: friendly(costError) }
  }

  revalidatePath('/stock')
  revalidatePath('/')
  return { ok: true }
}

export async function recordDip(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const dip_litres = Number(data.get('dip_litres'))
  if (!(dip_litres >= 0)) return { error: 'Enter the dip reading in litres.' }

  const { error } = await supabase.from('tank_dips').upsert(
    {
      tank_id: String(data.get('tank_id')),
      business_date: String(data.get('business_date')),
      dip_litres,
      notes: String(data.get('notes') ?? '').trim() || null,
    },
    { onConflict: 'station_id,tank_id,business_date' },
  )

  if (error) return { error: friendly(error) }
  revalidatePath('/stock')
  return { ok: true }
}

export async function deleteDelivery(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const id = String(formData.get('id'))
  // The cost row is owner-only, so a manager's delete would otherwise fail on
  // the foreign key with a message about nothing she can see.
  await supabase.from('fuel_purchase_costs').delete().eq('purchase_id', id)
  const outcome = changed(
    await supabase.from('fuel_purchases').delete().eq('id', id).select('id'),
    'this delivery',
  )
  if (outcome.error) return outcome
  revalidatePath('/stock')
  revalidatePath('/')
  return { ok: true }
}

export async function updateDelivery(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const session = await getSession()
  const id = String(data.get('id'))
  const litres = Number(data.get('litres'))
  if (!(litres > 0)) return { error: 'Enter how many litres were delivered.' }

  const outcome = changed(
    await supabase
      .from('fuel_purchases')
      .update({
        delivery_date: String(data.get('delivery_date')),
        tanker_number: String(data.get('tanker_number') ?? '').trim() || null,
        litres,
        density: data.get('density') ? Number(data.get('density')) : null,
        notes: String(data.get('notes') ?? '').trim() || null,
      })
      .eq('id', id)
      .select('id'),
    'this delivery',
  )
  if (outcome.error) return outcome

  // The cost side is owner-only, so the manager's form never sends it.
  const rate = Number(data.get('rate_per_litre') ?? 0)
  if (session?.profile.role === 'owner' && rate > 0) {
    const { error } = await supabase.from('fuel_purchase_costs').upsert(
      {
        purchase_id: id,
        supplier: String(data.get('supplier') ?? '').trim() || null,
        invoice_number: String(data.get('invoice_number') ?? '').trim() || null,
        rate_per_litre: rate,
        amount: Number((litres * rate).toFixed(2)),
      },
      { onConflict: 'purchase_id' },
    )
    if (error) return { error: friendly(error) }
  }

  revalidatePath('/stock')
  revalidatePath('/')
  return { ok: true }
}
