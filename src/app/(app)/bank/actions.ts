'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { changed, friendly, type FormState } from '@/lib/actions'

export async function addDeposit(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  const bank_name = String(data.get('bank_name') ?? '').trim()
  if (!bank_name) return { error: 'Which bank was it paid into?' }
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }

  const { error } = await supabase.from('bank_deposits').insert({
    deposit_date: String(data.get('deposit_date')),
    bank_name,
    account_last4: String(data.get('account_last4') ?? '').trim() || null,
    amount,
    slip_reference: String(data.get('slip_reference') ?? '').trim() || null,
    deposited_by: String(data.get('deposited_by') ?? '') || null,
    notes: String(data.get('notes') ?? '').trim() || null,
  })

  if (error) return { error: friendly(error) }

  revalidatePath('/bank')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteDeposit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase.from('bank_deposits').delete()
      .eq('id', String(formData.get('id'))).select('id'),
    'this deposit',
  )
  if (outcome.error) return outcome
  revalidatePath('/bank')
  revalidatePath('/')
  return { ok: true }
}

export async function updateDeposit(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  const bank_name = String(data.get('bank_name') ?? '').trim()
  if (!bank_name) return { error: 'Which bank was it paid into?' }
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }

  const outcome = changed(
    await supabase
      .from('bank_deposits')
      .update({
        deposit_date: String(data.get('deposit_date')),
        bank_name,
        account_last4: String(data.get('account_last4') ?? '').trim() || null,
        amount,
        slip_reference: String(data.get('slip_reference') ?? '').trim() || null,
        deposited_by: String(data.get('deposited_by') ?? '') || null,
        notes: String(data.get('notes') ?? '').trim() || null,
      })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this deposit',
  )
  if (outcome.error) return outcome

  revalidatePath('/bank')
  revalidatePath('/')
  return { ok: true }
}
