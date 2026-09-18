'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { friendly, type FormState } from '@/lib/actions'

/**
 * A pump and its first owner, made together.
 *
 * Neither is any use without the other: a station with no owner has nobody
 * who can close a day or add an account, and a login with no station can sign
 * in and see nothing. So if the second half fails the first is undone.
 *
 * The station and profile rows go in through admin_create_pump() as the super
 * admin's own session, so the audit trail records who really made the pump.
 * Only the login itself needs the service key.
 */
export async function createPump(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('is_platform_admin')
  if (allowed !== true) return { error: 'Only a super admin can create a pump.' }

  const name = String(data.get('name') ?? '').trim()
  const ownerName = String(data.get('owner_name') ?? '').trim()
  const email = String(data.get('owner_email') ?? '').trim().toLowerCase()
  const password = String(data.get('owner_password') ?? '')

  if (!name) return { error: 'Enter the pump name.' }
  if (!ownerName) return { error: "Enter the owner's name." }
  if (!email.includes('@')) return { error: "Enter the owner's email." }
  if (password.length < 8) return { error: 'The first password needs at least 8 characters.' }

  let admin
  try {
    admin = createServiceClient()
  } catch {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error || !created?.user) {
    return {
      error: /already been registered|already exists/i.test(error?.message ?? '')
        ? 'That email already has a login.'
        : (error?.message ?? 'The login could not be created.'),
    }
  }

  const { error: pumpError } = await supabase.rpc('admin_create_pump', {
    p_owner_user_id: created.user.id,
    p_owner_name: ownerName,
    p_name: name,
    p_legal: String(data.get('legal_name') ?? '').trim() || null,
    p_address: String(data.get('address') ?? '').trim() || null,
    p_city: String(data.get('city') ?? '').trim() || null,
    p_state: String(data.get('state') ?? '').trim() || null,
    p_pin: String(data.get('pincode') ?? '').trim() || null,
    p_gstin: String(data.get('gstin') ?? '').trim() || null,
    p_phone: String(data.get('phone') ?? '').trim() || null,
    p_prefix: String(data.get('invoice_prefix') ?? '').trim() || null,
  })

  if (pumpError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: friendly(pumpError) }
  }

  revalidatePath('/admin')
  return { ok: true }
}
