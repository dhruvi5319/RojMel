'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import { changed, friendly, type FormState } from '@/lib/actions'

/**
 * Petrol and diesel sit outside GST and attract state VAT, so a purchase
 * invoice reads as a basic amount plus the tax on it. VAT is taken as being
 * charged ON TOP of the per-litre rate, which is how a tax invoice normally
 * reads — the form shows the resulting total so it can be checked against the
 * paper before saving.
 */
function invoiceMoney(
  data: FormData,
  litres: number,
  rate: number,
  vatRate = Number(data.get('vat_rate') ?? 0),
) {
  const basic = Number((litres * rate).toFixed(2))
  const vat = Number(((basic * vatRate) / 100).toFixed(2))

  return {
    supplier: String(data.get('supplier') ?? '').trim() || null,
    invoice_number: String(data.get('invoice_number') ?? '').trim() || null,
    invoice_date: String(data.get('invoice_date') ?? '') || null,
    rate_per_litre: rate,
    basic_amount: basic,
    vat_rate: vatRate || null,
    vat_amount: vat || null,
    amount: Number((basic + vat).toFixed(2)),
  }
}

/**
 * A delivery is a tanker, not a tankful.
 *
 * The tanker comes from the depot with compartments — petrol in some, diesel
 * in others — and the pump does not log the compartments. It logs what was
 * decanted into each of its own tanks, so one visit writes one fuel_deliveries
 * row and a fuel_purchases line per tank. The tanker number, the seal and the
 * date are typed once, which is also the only way the two halves of a short
 * delivery can be argued as one load.
 */
export async function recordDelivery(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const session = await getSession()

  const tankIds = data.getAll('line_tank_id').map(String)
  const litresIn = data.getAll('line_litres').map(String)

  // Blank lines are the manager adding a row and not using it.
  const lines = tankIds
    .map((tank_id, i) => ({ tank_id, litres: Number(litresIn[i] ?? '') }))
    .filter((l) => l.tank_id && l.litres > 0)

  if (lines.length === 0) {
    return { error: 'Enter what went into at least one tank.' }
  }

  const { data: tanks } = await supabase
    .from('tanks')
    .select('id, fuel_type_id')
    .in('id', lines.map((l) => l.tank_id))

  const fuelOf = new Map((tanks ?? []).map((t) => [t.id, t.fuel_type_id]))
  if (lines.some((l) => !fuelOf.has(l.tank_id))) return { error: 'Choose a tank.' }
  if (new Set(lines.map((l) => l.tank_id)).size !== lines.length) {
    return { error: 'The same tank is on two lines. Put the whole quantity on one.' }
  }

  const { data: delivery, error } = await supabase
    .from('fuel_deliveries')
    .insert({
      delivery_date: String(data.get('delivery_date')),
      tanker_number: String(data.get('tanker_number') ?? '').trim() || null,
      seal_number: String(data.get('seal_number') ?? '').trim() || null,
      seals_intact: data.get('seals_intact') === 'on',
      water_check_ok: data.get('water_check_ok') === 'on',
      received_by: String(data.get('received_by') ?? '') || null,
      notes: String(data.get('notes') ?? '').trim() || null,
    })
    .select('id')
    .single()

  if (error) return { error: friendly(error) }

  // Each line's own figure, read off the same position in the form.
  const at = (field: string, i: number) => {
    const v = String(data.getAll(field)[i] ?? '').trim()
    return v === '' ? null : Number(v)
  }

  const { data: saved, error: lineError } = await supabase
    .from('fuel_purchases')
    .insert(
      lines.map((l, i) => ({
        delivery_id: delivery.id,
        tank_id: l.tank_id,
        fuel_type_id: fuelOf.get(l.tank_id)!,
        delivery_date: String(data.get('delivery_date')),
        // Three quantities, kept apart because a shortage argument turns on them.
        ordered_litres: at('line_ordered_litres', i),
        invoice_litres: at('line_invoice_litres', i),
        tanker_dip_litres: at('line_tanker_dip_litres', i),
        litres: l.litres,
        dip_before_litres: at('line_dip_before_litres', i),
        dip_after_litres: at('line_dip_after_litres', i),
        density: at('line_density', i),
        temperature_c: at('line_temperature_c', i),
        decanted_at: new Date().toISOString(),
      })),
    )
    .select('id')

  if (lineError) {
    // A tanker with nothing decanted off it is not a delivery.
    await supabase.from('fuel_deliveries').delete().eq('id', delivery.id)
    return { error: friendly(lineError) }
  }

  // Only an owner may write the cost side; RLS would reject it anyway, so the
  // manager's form simply never sends these fields. One challan, one supplier
  // and invoice number — but a rate per product.
  if (session?.profile.role === 'owner') {
    const costs = (saved ?? [])
      .map((row, i) => ({ row, rate: at('line_rate_per_litre', i) ?? 0, i }))
      .filter((c) => c.rate > 0)
      .map((c) => ({
        purchase_id: c.row.id,
        ...invoiceMoney(data, lines[c.i].litres, c.rate, at('line_vat_rate', c.i) ?? 0),
      }))

    if (costs.length > 0) {
      const { error: costError } = await supabase.from('fuel_purchase_costs').insert(costs)
      if (costError) return { error: friendly(costError) }
    }
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
  const { data: line } = await supabase
    .from('fuel_purchases')
    .select('delivery_id')
    .eq('id', id)
    .maybeSingle<{ delivery_id: string }>()

  const outcome = changed(
    await supabase.from('fuel_purchases').delete().eq('id', id).select('id'),
    'this delivery',
  )
  if (outcome.error) return outcome

  // A tanker with nothing left decanted off it is not a delivery any more.
  if (line) {
    const { count } = await supabase
      .from('fuel_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('delivery_id', line.delivery_id)
    if (!count) await supabase.from('fuel_deliveries').delete().eq('id', line.delivery_id)
  }
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

  // The tanker's own facts live on the visit, so an edit to them reaches
  // every tank it filled — that is the point of the visit existing.
  const delivery_id = String(data.get('delivery_id'))
  const visit = changed(
    await supabase
      .from('fuel_deliveries')
      .update({
        delivery_date: String(data.get('delivery_date')),
        tanker_number: String(data.get('tanker_number') ?? '').trim() || null,
        seal_number: String(data.get('seal_number') ?? '').trim() || null,
        seals_intact: data.get('seals_intact') === 'on',
        water_check_ok: data.get('water_check_ok') === 'on',
      })
      .eq('id', delivery_id)
      .select('id'),
    'this delivery',
  )
  if (visit.error) return visit

  const outcome = changed(
    await supabase
      .from('fuel_purchases')
      .update({
        litres,
        ordered_litres: data.get('ordered_litres') ? Number(data.get('ordered_litres')) : null,
        invoice_litres: data.get('invoice_litres') ? Number(data.get('invoice_litres')) : null,
        tanker_dip_litres: data.get('tanker_dip_litres')
          ? Number(data.get('tanker_dip_litres'))
          : null,
        density: data.get('density') ? Number(data.get('density')) : null,
        temperature_c: data.get('temperature_c') ? Number(data.get('temperature_c')) : null,
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
      { purchase_id: id, ...invoiceMoney(data, litres, rate) },
      { onConflict: 'purchase_id' },
    )
    if (error) return { error: friendly(error) }
  }

  revalidatePath('/stock')
  revalidatePath('/')
  return { ok: true }
}
