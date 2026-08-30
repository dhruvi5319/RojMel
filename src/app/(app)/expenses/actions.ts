'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { changed, friendly, type FormState } from '@/lib/actions'
import type { PaymentMode } from '@/lib/database.types'

export async function addExpense(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  const category = String(data.get('category') ?? '').trim()
  if (!category) return { error: 'Choose or type a category.' }
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }

  const { error } = await supabase.from('expenses').insert({
    business_date: String(data.get('business_date')),
    category,
    description: String(data.get('description') ?? '').trim() || null,
    amount,
    mode: String(data.get('mode')) as PaymentMode,
    paid_to: String(data.get('paid_to') ?? '').trim() || null,
  })

  if (error) return { error: friendly(error) }

  revalidatePath('/expenses')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteExpense(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase.from('expenses').delete()
      .eq('id', String(formData.get('id'))).select('id'),
    'this expense',
  )
  if (outcome.error) return outcome
  revalidatePath('/expenses')
  revalidatePath('/')
  return { ok: true }
}

export async function updateExpense(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  const category = String(data.get('category') ?? '').trim()
  if (!category) return { error: 'Choose or type a category.' }
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }

  const outcome = changed(
    await supabase
      .from('expenses')
      .update({
        business_date: String(data.get('business_date')),
        category,
        description: String(data.get('description') ?? '').trim() || null,
        amount,
        mode: String(data.get('mode')) as PaymentMode,
        paid_to: String(data.get('paid_to') ?? '').trim() || null,
      })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this expense',
  )
  if (outcome.error) return outcome

  revalidatePath('/expenses')
  revalidatePath('/')
  return { ok: true }
}
