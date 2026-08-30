'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  BadgeIndianRupee, Banknote, ChartNoAxesCombined, Droplets, Fuel,
  Gauge, Menu, Notebook, Receipt, Settings, Truck, Users, Wallet, X,
} from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import type { DictKey } from '@/lib/i18n/dict'
import type { UserRole } from '@/lib/database.types'

type Item = { href: string; key: DictKey; icon: typeof Gauge; ownerOnly?: boolean }

const GROUPS: { items: Item[] }[] = [
  {
    items: [
      { href: '/', key: 'nav.dashboard', icon: Gauge },
      { href: '/day', key: 'nav.day', icon: Notebook },
      { href: '/shifts', key: 'nav.shifts', icon: Fuel },
    ],
  },
  {
    items: [
      { href: '/credit', key: 'nav.credit', icon: Truck },
      { href: '/customers', key: 'nav.customers', icon: Users },
      { href: '/invoices', key: 'nav.invoices', icon: Receipt },
      { href: '/payments', key: 'nav.payments', icon: BadgeIndianRupee },
    ],
  },
  {
    items: [
      { href: '/stock', key: 'nav.stock', icon: Droplets },
      { href: '/expenses', key: 'nav.expenses', icon: Wallet },
      { href: '/staff', key: 'nav.staff', icon: Users },
      { href: '/bank', key: 'nav.bank', icon: Banknote },
    ],
  },
  {
    items: [
      { href: '/reports', key: 'nav.reports', icon: ChartNoAxesCombined, ownerOnly: true },
      { href: '/settings', key: 'nav.settings', icon: Settings },
    ],
  },
]

function useIsActive() {
  const pathname = usePathname()
  return (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function NavLinks({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const t = useT()
  const isActive = useIsActive()

  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((group, i) => {
        const items = group.items.filter((it) => !it.ownerOnly || role === 'owner')
        if (items.length === 0) return null
        return (
          <div key={i} className="flex flex-col gap-0.5">
            {items.map(({ href, key, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition ${
                    active
                      ? 'bg-brand-soft text-brand'
                      : 'text-muted hover:bg-surface-2 hover:text-foreground'
                  }`}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  <span className="truncate">{t(key)}</span>
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

/** Desktop: a permanent rail beside the content. */
export function NavRail({ role }: { role: UserRole }) {
  return (
    <aside className="no-print hidden w-60 shrink-0 border-r border-border bg-surface px-3 py-5 lg:block">
      <NavLinks role={role} />
    </aside>
  )
}

/** Phone: a sheet, because the forecourt is a one-handed place. */
export function NavSheet({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="no-print rounded-lg border border-border bg-surface p-2 lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {open ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[17rem] overflow-y-auto bg-surface px-3 py-4 shadow-xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 hover:bg-surface-2"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <NavLinks role={role} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  )
}
