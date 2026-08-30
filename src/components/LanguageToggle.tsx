'use client'

import { useTransition } from 'react'
import { LANGS } from '@/lib/i18n/dict'
import { useLang } from '@/lib/i18n/client'
import { setLanguage } from '@/app/actions/language'

/** Language lives in a cookie so server-rendered pages get it too. */
export function LanguageToggle() {
  const lang = useLang()
  const [pending, startTransition] = useTransition()

  return (
    <div
      className="inline-flex rounded-lg border border-border bg-surface p-0.5"
      role="group"
      aria-label="Language"
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => startTransition(() => setLanguage(l.code))}
          disabled={pending}
          aria-pressed={lang === l.code}
          className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${
            lang === l.code
              ? 'bg-brand text-white'
              : 'text-muted hover:text-foreground'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
