import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Station } from '@/lib/database.types'

export interface Session {
  profile: Profile
  station: Station
}

/**
 * The signed-in person and their pump. Everything the app renders hangs off
 * this; RLS enforces the same boundary again in the database, so a mistake
 * here cannot leak another pump's books.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<Profile>()

  if (!profile || !profile.is_active) return null

  const { data: station } = await supabase
    .from('stations')
    .select('*')
    .eq('id', profile.station_id)
    .maybeSingle<Station>()

  if (!station) return null
  return { profile, station }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (session) return session

  // A super admin belongs to no pump, so they have no profile and no session
  // in this sense. Sending them to /login would bounce them straight back
  // here, so they go where their work is.
  if (await isPlatformAdmin()) redirect('/admin')

  // Signed in, but with no active profile at any pump — a removed manager, or
  // a login made before its pump existed. Without the reason on the query
  // string the proxy would send them straight back here and the two would
  // bounce off each other forever.
  redirect('/login?removed=1')
}

/**
 * The super admin: the account that creates a pump and its first owner.
 *
 * They are deliberately not a user_role — a role sits on a profile and a
 * profile sits in a station, and this account sits outside every station. The
 * database answers the question through is_platform_admin(), because the table
 * itself is readable by nobody.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.rpc('is_platform_admin')
  return data === true
}

export async function requirePlatformAdmin(): Promise<{ id: string; email: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data } = await supabase.rpc('is_platform_admin')
  if (data !== true) redirect('/')
  return { id: user.id, email: user.email ?? '' }
}

/** Back office = owner or manager. The counter device is sent to its own screen. */
export async function requireBackOffice(): Promise<Session> {
  const session = await requireSession()
  if (session.profile.role === 'counter') redirect('/counter')
  return session
}

export async function requireOwner(): Promise<Session> {
  const session = await requireSession()
  if (session.profile.role !== 'owner') redirect('/')
  return session
}

export function isOwner(session: Session) {
  return session.profile.role === 'owner'
}
