'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { friendly, type FormState } from '@/lib/actions'
import type { UserRole } from '@/lib/database.types'

/**
 * Accounts are made for people, never by them.
 *
 * A pump is not a website: nobody signs themselves up. The super admin makes
 * the pump and its first owner; the owner makes the office accounts, because
 * managers change and waiting on an administrator to change one is how a pump
 * ends up sharing a password.
 *
 * Making a login is Supabase's admin API and needs the service key, so it
 * happens here on the server, and only after the database has been asked
 * whether this person may. The profile row is written by add_office_account()
 * as the caller, so the audit trail records who really did it.
 */
export async function addAccount(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const session = await getSession()
  if (session?.profile.role !== 'owner') {
    return { error: 'Only an owner can add an account.' }
  }

  const email = String(data.get('email') ?? '').trim().toLowerCase()
  const fullName = String(data.get('full_name') ?? '').trim()
  const role = String(data.get('role') ?? 'manager') as UserRole
  const password = String(data.get('password') ?? '')

  if (!email.includes('@')) return { error: 'Enter the email they will sign in with.' }
  if (!fullName) return { error: 'Enter their name.' }
  if (password.length < 8) return { error: 'The first password needs at least 8 characters.' }

  let admin
  try {
    admin = createServiceClient()
  } catch {
    return {
      error:
        'This app cannot create logins yet: SUPABASE_SERVICE_ROLE_KEY is not set on the server.',
    }
  }

  // Confirmed straight away: there is no inbox to click a link in at a pump.
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

  const supabase = await createClient()
  const { error: profileError } = await supabase.rpc('add_office_account', {
    p_user_id: created.user.id,
    p_full_name: fullName,
    p_role: role,
    p_phone: String(data.get('phone') ?? '').trim() || null,
  })

  if (profileError) {
    // A login with no pump behind it can sign in and see nothing, so it does
    // not get to exist.
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: friendly(profileError) }
  }

  revalidatePath('/people')
  return { ok: true }
}

/**
 * Removing somebody is retiring them, not deleting them: their name is on
 * shifts, slips and the audit trail, and those have to keep reading correctly.
 * An inactive profile cannot sign in — getSession() refuses it.
 */
export async function setAccountActive(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_account_active', {
    p_user_id: String(data.get('user_id')),
    p_active: data.get('active') === 'true',
  })
  if (error) return { error: friendly(error) }
  revalidatePath('/people')
  return { ok: true }
}

/** A forgotten password, reset by the owner rather than by an administrator. */
export async function resetAccountPassword(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const session = await getSession()
  if (session?.profile.role !== 'owner') {
    return { error: 'Only an owner can reset a password.' }
  }

  const userId = String(data.get('user_id'))
  const password = String(data.get('password') ?? '')
  if (password.length < 8) return { error: 'The new password needs at least 8 characters.' }

  // Only for an account at this pump: the service key can reach every account
  // in the project, so the station boundary is checked here in its place.
  const supabase = await createClient()
  const { data: theirs } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('station_id', session.profile.station_id)
    .maybeSingle<{ id: string }>()

  if (!theirs) return { error: 'That account is not at this pump.' }

  let admin
  try {
    admin = createServiceClient()
  } catch {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return { error: error.message }

  revalidatePath('/people')
  return { ok: true }
}
