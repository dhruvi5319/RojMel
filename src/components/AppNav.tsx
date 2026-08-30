'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useT } from '@/lib/i18n/client'
import { useLang } from '@/lib/i18n/client'
import { LANGS } from '@/lib/i18n/dict'
import { setLanguage } from '@/app/actions/language'
import { addDays, todayIST } from '@/lib/format'
import { TABS, isDatedPath, tabForPath, visibleItems } from '@/lib/nav'
import type { UserRole } from '@/lib/database.types'

/* ── the four doors ─────────────────────────────────────────────────────── */

export function TabBar({ role }: { role: UserRole }) {
  const t = useT()
  const pathname = usePathname()
  const active = tabForPath(pathname)

  return (
    <div className="no-print flex gap-1 overflow-x-auto px-4 sm:px-6">
      {TABS.map((tab) => {
        const items = visibleItems(tab.key, role)
        if (items.length === 0) return null
        const on = active === tab.key
        return (
          <Link
            key={tab.key}
            href={items[0].href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-t-[18px] px-5 pt-3 pb-3.5 text-[14.5px] font-semibold whitespace-nowrap transition ${
              on ? 'bg-bg text-text' : 'text-neutral-600 hover:text-text'
            }`}
          >
            {t(tab.label)}
          </Link>
        )
      })}
    </div>
  )
}

/* ── the pages behind whichever door is open ────────────────────────────── */

export function PillBar({ role }: { role: UserRole }) {
  const t = useT()
  const pathname = usePathname()
  const params = useSearchParams()
  const items = visibleItems(tabForPath(pathname), role)
  const date = params.get('date')

  return (
    <div className="no-print flex flex-wrap gap-1.5 px-4 pt-4 sm:px-6">
      {items.map((item) => {
        const on =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        // Carry the chosen day across the pages it governs.
        const href = item.dated && date ? `${item.href}?date=${date}` : item.href
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-full px-4 py-[7px] text-[12.5px] font-semibold transition ${
              on
                ? 'bg-accent text-bg'
                : 'bg-surface text-neutral-700 hover:bg-accent-100'
            }`}
          >
            {t(item.key)}
          </Link>
        )
      })}
    </div>
  )
}

/* ── one date governs the whole day ─────────────────────────────────────── */

export function DateStepper() {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const today = todayIST()
  const date = params.get('date') || today

  if (!isDatedPath(pathname)) return null

  function go(next: string) {
    const q = new URLSearchParams(params)
    if (next === today) q.delete('date')
    else q.set('date', next)
    const qs = q.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })

  return (
    <div className="no-print flex items-center gap-2 rounded-full bg-bg py-1 pr-1.5 pl-3.5">
      <button
        type="button"
        onClick={() => go(addDays(date, -1))}
        aria-label="Previous day"
        className="cursor-pointer px-1 text-[15px] leading-none font-bold text-neutral-600 hover:text-text"
      >
        ‹
      </button>
      <span className="text-[13px] font-semibold whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={() => go(addDays(date, 1))}
        disabled={date >= today}
        aria-label="Next day"
        className="cursor-pointer px-1 text-[15px] leading-none font-bold text-neutral-600 hover:text-text disabled:opacity-35"
      >
        ›
      </button>
    </div>
  )
}

/* ── language ───────────────────────────────────────────────────────────── */

export function LanguageSeg({ compact = false }: { compact?: boolean }) {
  const lang = useLang()
  const [pending, startTransition] = useTransition()

  return (
    <div
      className="no-print inline-flex overflow-hidden rounded-full border border-divider"
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
          className={`cursor-pointer px-3 py-[6px] text-[12px] leading-[1.5] transition ${
            lang === l.code
              ? 'bg-accent text-bg'
              : 'text-neutral-700 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]'
          }`}
        >
          {compact ? (l.code === 'en' ? 'EN' : 'ગુ') : l.label}
        </button>
      ))}
    </div>
  )
}
