'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { changed, friendly, type FormState } from '@/lib/actions'
import type { PaymentMode, StaffPaymentType } from '@/lib/database.types'

export async function addStaff(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const name = String(data.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required.' }

  const pin = String(data.get('pin') ?? '').trim()
  if (pin && !/^\d{4}$/.test(pin)) return { error: 'The PIN must be four digits.' }

  const { error } = await supabase.from('staff').insert({
    name,
    name_gu: String(data.get('name_gu') ?? '').trim() || null,
    phone: String(data.get('phone') ?? '').trim() || null,
    pin: pin || null,
    monthly_salary: Number(data.get('monthly_salary') ?? 0),
    joined_on: String(data.get('joined_on') ?? '') || null,
  })

  if (error) return { error: friendly(error) }
  revalidatePath('/staff')
  return { ok: true }
}

export async function updateStaff(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const pin = String(data.get('pin') ?? '').trim()
  if (pin && !/^\d{4}$/.test(pin)) return { error: 'The PIN must be four digits.' }

  const result = await supabase
    .from('staff')
    .update({
      name: String(data.get('name') ?? '').trim(),
      name_gu: String(data.get('name_gu') ?? '').trim() || null,
      phone: String(data.get('phone') ?? '').trim() || null,
      pin: pin || null,
      monthly_salary: Number(data.get('monthly_salary') ?? 0),
      is_active: data.get('is_active') === 'on',
    })
    .eq('id', String(data.get('id')))
    .select('id')

  const outcome = changed(result, 'this person')
  if (outcome.error) return outcome

  revalidatePath('/staff')
  return { ok: true }
}

export async function payStaff(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }

  const month = String(data.get('period_month') ?? '').trim()

  const { error } = await supabase.from('staff_payments').insert({
    staff_id: String(data.get('staff_id')),
    payment_date: String(data.get('payment_date')),
    type: String(data.get('type')) as StaffPaymentType,
    amount,
    period_month: month ? `${month}-01` : null,
    mode: String(data.get('mode')) as PaymentMode,
    notes: String(data.get('notes') ?? '').trim() || null,
  })

  if (error) return { error: friendly(error) }
  revalidatePath('/staff')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteStaffPayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const outcome = changed(
    await supabase.from('staff_payments').delete()
      .eq('id', String(formData.get('id'))).select('id'),
    'this payment',
  )
  if (outcome.error) return outcome
  revalidatePath('/staff')
  revalidatePath('/')
  return { ok: true }
}

export async function updateStaffPayment(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const amount = Number(data.get('amount'))
  if (!(amount > 0)) return { error: 'Enter an amount greater than zero.' }
  const month = String(data.get('period_month') ?? '').trim()

  const outcome = changed(
    await supabase
      .from('staff_payments')
      .update({
        payment_date: String(data.get('payment_date')),
        type: String(data.get('type')) as StaffPaymentType,
        amount,
        period_month: month ? `${month}-01` : null,
        mode: String(data.get('mode')) as PaymentMode,
        notes: String(data.get('notes') ?? '').trim() || null,
      })
      .eq('id', String(data.get('id')))
      .select('id'),
    'this payment',
  )
  if (outcome.error) return outcome

  revalidatePath('/staff')
  revalidatePath('/')
  return { ok: true }
}
