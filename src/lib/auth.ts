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
  if (!session) redirect('/login')
  return session
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
