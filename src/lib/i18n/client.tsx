'use client'

import { createContext, useCallback, useContext, useMemo } from 'react'
import { dictionaries, type DictKey, type Lang } from './dict'

const LangContext = createContext<Lang>('en')

export function LanguageProvider({
  lang,
  children,
}: {
  lang: Lang
  children: React.ReactNode
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

/** Translator for client components. */
export function useT() {
  const lang = useLang()
  const dict = useMemo(() => dictionaries[lang], [lang])
  return useCallback((key: DictKey) => dict[key], [dict])
}
