import { Fuel } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { DateStepper, LanguageSeg, PillBar, TabBar } from '@/components/AppNav'
import { SignOutButton } from '@/components/SignOutButton'
import { Badge } from '@/components/ui'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile, station } = await requireBackOffice()
  const t = await getT()

  const initial = profile.full_name.trim().charAt(0).toUpperCase() || '·'

  return (
    <div className="flex min-h-dvh flex-col">
      {/* The header and the tabs share the sand surface; the open tab cuts a
          notch into it and the content below sits on the lighter ground. */}
      <header className="no-print bg-surface">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-1 sm:px-6">
          <span className="flex size-9 shrink-0 place-items-center justify-center rounded-full bg-accent text-bg">
            <Fuel className="size-[18px]" aria-hidden />
          </span>

          <div className="min-w-0">
            <div className="truncate font-[family-name:var(--font-heading)] text-[17px] leading-tight">
              {station.name}
            </div>
            <div className="truncate text-[11.5px] text-neutral-600">
              {profile.full_name} · {t(`role.${profile.role}`)}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <DateStepper />
            <span className="hidden sm:inline">
              <Badge tone="accent">{t(`role.${profile.role}`)}</Badge>
            </span>
            <LanguageSeg compact />
            <span
              aria-hidden
              className="hidden size-8 place-items-center rounded-full bg-accent-2-300 font-[family-name:var(--font-heading)] text-[14px] text-accent-2-900 sm:grid"
            >
              {initial}
            </span>
            <SignOutButton />
          </div>
        </div>

        <TabBar role={profile.role} />
      </header>

      <div className="flex-1 bg-bg">
        <PillBar role={profile.role} />
        <main className="px-4 py-5 sm:px-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
