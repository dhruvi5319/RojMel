import { Fuel } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { NavRail, NavSheet } from '@/components/AppNav'
import { LanguageToggle } from '@/components/LanguageToggle'
import { SignOutButton } from '@/components/SignOutButton'
import { Badge } from '@/components/ui'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile, station } = await requireBackOffice()
  const t = await getT()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
          <NavSheet role={profile.role} />

          <div className="flex min-w-0 items-center gap-2.5">
            <span className="hidden size-9 items-center justify-center rounded-lg bg-brand text-white sm:flex">
              <Fuel className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">
                {station.name}
              </div>
              <div className="truncate text-xs text-muted">
                {profile.full_name} · {t(`role.${profile.role}`)}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {profile.role === 'owner' ? (
              <span className="hidden sm:inline">
                <Badge tone="brand">{t('role.owner')}</Badge>
              </span>
            ) : null}
            <LanguageToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <NavRail role={profile.role} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
