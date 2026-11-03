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

/**
 * Everything the creation form typed in, fixed afterward — the super admin's
 * own equivalent of an owner editing their pump on /settings, just reaching
 * any pump instead of only their own.
 */
export async function updatePump(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_update_pump', {
    p_station_id: String(data.get('station_id')),
    p_name: String(data.get('name') ?? '').trim(),
    p_legal: String(data.get('legal_name') ?? '').trim() || null,
    p_address: String(data.get('address') ?? '').trim() || null,
    p_city: String(data.get('city') ?? '').trim() || null,
    p_state: String(data.get('state') ?? '').trim() || null,
    p_pin: String(data.get('pincode') ?? '').trim() || null,
    p_gstin: String(data.get('gstin') ?? '').trim() || null,
    p_phone: String(data.get('phone') ?? '').trim() || null,
    p_prefix: String(data.get('invoice_prefix') ?? '').trim() || null,
  })
  if (error) return { error: friendly(error) }

  revalidatePath('/admin')
  return { ok: true }
}

/**
 * Retiring a pump, not deleting it — every shift, slip and audit record
 * stays exactly as it was; this just stops anybody signing into it, the same
 * way removing one person's account does, for all of them at once.
 */
export async function setPumpActive(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_pump_active', {
    p_station_id: String(data.get('station_id')),
    p_active: data.get('active') === 'true',
  })
  if (error) return { error: friendly(error) }

  revalidatePath('/admin')
  return { ok: true }
}

/**
 * A forgotten password, given back by the super admin — for when it is lost
 * before the owner, or anyone else at a pump, ever signs in to change it
 * themselves. Same shape as resetAccountPassword() on /people, just not
 * limited to the caller's own pump.
 */
export async function resetPumpAccountPassword(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('is_platform_admin')
  if (allowed !== true) return { error: 'Only a super admin can reset a password.' }

  const userId = String(data.get('user_id'))
  const password = String(data.get('password') ?? '')
  if (password.length < 8) return { error: 'The new password needs at least 8 characters.' }

  // The service key can reach every login in the project, not just a pump's
  // — so the account has to actually belong to one first. A platform admin
  // has no profile of their own, so this asks through a function rather than
  // reading the table directly, which their own session cannot do.
  const { data: theirs } = await supabase.rpc('admin_account_exists', {
    p_user_id: userId,
  })
  if (theirs !== true) return { error: 'That account does not belong to a pump.' }

  let admin
  try {
    admin = createServiceClient()
  } catch {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { ok: true }
}
