'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { FormState } from '@/components/ActionForm'

export async function submitDay(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('submit_day', {
    p_date: String(data.get('business_date')),
    p_counted_cash: Number(data.get('counted_cash') ?? 0),
    p_notes: String(data.get('notes') ?? '').trim() || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/day')
  revalidatePath('/')
  return { ok: true }
}

export async function approveDay(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('approve_day', {
    p_date: String(data.get('business_date')),
    p_remarks: String(data.get('remarks') ?? '').trim() || null,
  })

  if (error) return { error: error.message.replace(/^.*?:\s*/, '') }

  revalidatePath('/day')
  revalidatePath('/shifts')
  revalidatePath('/')
  return { ok: true }
}

export async function reopenDay(_prev: FormState, data: FormData): Promise<FormState> {
  const supabase = await createClient()
  const reason = String(data.get('reason') ?? '').trim()
  if (!reason) return { error: 'Give a reason, so the change has a record.' }

  const { error } = await supabase.rpc('reopen_day', {
    p_date: String(data.get('business_date')),
    p_reason: reason,
  })

  if (error) return { error: error.message.replace(/^.*?:\s*/, '') }

  revalidatePath('/day')
  revalidatePath('/shifts')
  revalidatePath('/')
  return { ok: true }
}
