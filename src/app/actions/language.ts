'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { LANG_COOKIE } from '@/lib/i18n/server'

/** Persist the chosen language for a year, for server and client alike. */
export async function setLanguage(code: string) {
  const lang = code === 'gu' ? 'gu' : 'en'
  const store = await cookies()

  store.set(LANG_COOKIE, lang, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  revalidatePath('/', 'layout')
}
