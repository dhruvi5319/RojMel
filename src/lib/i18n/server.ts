import { cookies } from 'next/headers'
import { dictionaries, type DictKey, type Lang } from './dict'

export const LANG_COOKIE = 'pump_lang'

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value
  return value === 'gu' ? 'gu' : 'en'
}

/** Translator for server components. */
export async function getT() {
  const lang = await getLang()
  const dict = dictionaries[lang]
  return (key: DictKey) => dict[key]
}
