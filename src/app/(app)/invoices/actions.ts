'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { changed, type FormState } from '@/lib/actions'

export async function generateInvoice(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()

  const { data: id, error } = await supabase.rpc('generate_invoice', {
    p_customer_id: String(data.get('customer_id')),
    p_from: String(data.get('period_from')),
    p_to: String(data.get('period_to')),
    p_tax_rate: Number(data.get('tax_rate') ?? 0),
    p_due_days: Number(data.get('due_days') ?? 15),
  })

  if (error) {
    // The function raises a plain message when there is nothing to bill.
    return { error: error.message.replace(/^.*?:\s*/, '') }
  }

  revalidatePath('/invoices')
  revalidatePath('/customers')
  redirect(`/invoices/${id}`)
}

export async function cancelInvoice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const id = String(formData.get('id'))

  // Releasing the slips first means they can be billed again on a corrected
  // invoice instead of vanishing from the customer's next bill.
  await supabase.from('credit_sales').update({ invoice_id: null }).eq('invoice_id', id)

  const outcome = changed(
    await supabase.from('invoices').update({ status: 'cancelled' })
      .eq('id', id).select('id'),
    'this invoice',
  )
  if (outcome.error) return outcome

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  revalidatePath('/customers')
  return { ok: true }
}
