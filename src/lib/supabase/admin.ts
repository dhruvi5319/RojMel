import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * A client that can create and delete logins.
 *
 * Creating a login is Supabase's admin API, which needs the service key — a
 * key that bypasses every row level security policy in the database. So it is
 * read from the environment inside server-only code, is never passed to a
 * component, and every caller must first prove who is asking through the
 * ordinary session client. If this key ever reaches the browser, the pump's
 * books are open to anyone who opens the devtools.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** True once the key is present, so a screen can say so instead of throwing. */
export function canCreateLogins() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
