'use server'

import { createClient } from '@/lib/supabase/server'
import type { FormState } from '@/lib/actions'

/**
 * Changing your own password.
 *
 * There was no way to do this at all: a password was whatever an
 * administrator had typed into Supabase, which means in practice it never
 * changed and got written on a piece of paper by the till.
 *
 * The current password is asked for and checked by signing in with it, so
 * somebody who walks up to an unattended screen cannot lock the owner out of
 * his own books.
 */
export async function changeMyPassword(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const supabase = await createClient()
  const current = String(data.get('current_password') ?? '')
  const next = String(data.get('password') ?? '')
  const again = String(data.get('password_again') ?? '')

  if (next.length < 8) return { error: 'The new password needs at least 8 characters.' }
  if (next !== again) return { error: 'The two passwords do not match.' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'You are not signed in.' }

  const { error: wrong } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  })
  if (wrong) return { error: 'That is not your current password.' }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: error.message }

  return { ok: true }
}
