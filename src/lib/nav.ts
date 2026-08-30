import type { DictKey } from '@/lib/i18n/dict'
import type { UserRole } from '@/lib/database.types'

/**
 * Four doors instead of thirteen. The design regroups every page under
 * Today / Udhaar / Pump / More so someone opening this for the first time
 * meets four choices, not a list of thirteen.
 */
export type TabKey = 'today' | 'udhaar' | 'pump' | 'more'

export interface NavItem {
  href: string
  key: DictKey
  ownerOnly?: boolean
  /** Pages the header's date stepper governs. */
  dated?: boolean
}

export const TABS: { key: TabKey; label: DictKey; items: NavItem[] }[] = [
  {
    key: 'today',
    label: 'tab.today',
    items: [
      { href: '/', key: 'nav.dashboard', dated: true },
      { href: '/shifts', key: 'nav.shifts', dated: true },
      { href: '/credit', key: 'nav.credit', dated: true },
      { href: '/day', key: 'nav.day', dated: true },
    ],
  },
  {
    key: 'udhaar',
    label: 'tab.udhaar',
    items: [
      { href: '/customers', key: 'nav.customers' },
      { href: '/invoices', key: 'nav.invoices' },
      { href: '/payments', key: 'nav.payments' },
    ],
  },
  {
    key: 'pump',
    label: 'tab.pump',
    items: [
      { href: '/stock', key: 'nav.stock' },
      { href: '/expenses', key: 'nav.expenses' },
      { href: '/staff', key: 'nav.staff' },
      { href: '/bank', key: 'nav.bank' },
    ],
  },
  {
    key: 'more',
    label: 'tab.more',
    items: [
      { href: '/reports', key: 'nav.reports', ownerOnly: true },
      { href: '/audit', key: 'nav.audit', ownerOnly: true },
      { href: '/permissions', key: 'nav.permissions' },
      { href: '/settings', key: 'nav.settings' },
    ],
  },
]

export function visibleItems(tab: TabKey, role: UserRole) {
  return (
    TABS.find((t) => t.key === tab)?.items.filter(
      (i) => !i.ownerOnly || role === 'owner',
    ) ?? []
  )
}

/** Which tab owns a path — '/' only matches itself. */
export function tabForPath(pathname: string): TabKey {
  for (const tab of TABS) {
    for (const item of tab.items) {
      if (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) {
        return tab.key
      }
    }
  }
  return 'today'
}

export function isDatedPath(pathname: string): boolean {
  return TABS.flatMap((t) => t.items).some(
    (i) => i.dated && (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)),
  )
}
