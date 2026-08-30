import type { PostgrestError } from '@supabase/supabase-js'

export interface FormState {
  error?: string
  ok?: boolean
}

/**
 * Postgres row level security does not reject a forbidden UPDATE or DELETE —
 * it simply matches no rows and returns 204. Without this check the app would
 * cheerfully report "Saved" while nothing changed, which is worse than an
 * error. Every update and delete therefore asks for its rows back and calls
 * this to confirm something actually happened.
 */
export function changed(
  result: { data: unknown[] | null; error: PostgrestError | null },
  subject = 'this',
): FormState {
  if (result.error) return { error: friendly(result.error) }
  if (!result.data || result.data.length === 0) {
    return {
      error:
        `Nothing was changed. You may not have permission to edit ${subject}, ` +
        `it may have been removed, or the day may be approved and locked.`,
    }
  }
  return { ok: true }
}

/** Turn Postgres's wording into something readable at the pump. */
export function friendly(error: PostgrestError): string {
  switch (error.code) {
    case '23505':
      return 'That already exists — the name or number is in use.'
    case '23503':
      return 'Something else still refers to this, so it cannot be removed.'
    case '42501':
      return 'You do not have permission to do that.'
    default:
      // Triggers raise plain messages; strip the "…: " prefix Postgres adds.
      return error.message.replace(/^.*?:\s*(?=[A-Z])/, '')
  }
}
