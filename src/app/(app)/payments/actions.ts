'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { changed, friendly, type FormState } from '@/lib/actions'
import type { PaymentMode } from '@/lib/database.types'

export async function recordPayment(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }

  const { error } = await supabase.from('payments').insert({
    customer_id: String(data.get('customer_id')),
    invoice_id: String(data.get('invoice_id') ?? '') || null,
    payment_date: String(data.get('payment_date')),
    amount,
    mode: String(data.get('mode')) as PaymentMode,
    reference: String(data.get('reference') ?? '').trim() || null,
    notes: String(data.get('notes') ?? '').trim() || null,
  })

  if (error) return { error: friendly(error) }

  revalidatePath('/payments')
  revalidatePath('/customers')
  revalidatePath('/invoices')
  revalidatePath('/')
  redirect('/payments')
}

export async function deletePayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase.from('payments').delete()
      .eq('id', String(formData.get('id'))).select('id'),
    'this payment',
  )
  if (outcome.error) return outcome
  revalidatePath('/payments')
  revalidatePath('/customers')
  revalidatePath('/invoices')
  revalidatePath('/')
  return { ok: true }
}

export async function updatePayment(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }

  const outcome = changed(
    await supabase
      .from('payments')
      .update({
        payment_date: String(data.get('payment_date')),
        amount,
        mode: String(data.get('mode')) as PaymentMode,
        reference: String(data.get('reference') ?? '').trim() || null,
        notes: String(data.get('notes') ?? '').trim() || null,
      })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this payment',
  )
  if (outcome.error) return outcome

  revalidatePath('/payments')
  revalidatePath('/customers')
  revalidatePath('/invoices')
  revalidatePath('/')
  return { ok: true }
}
