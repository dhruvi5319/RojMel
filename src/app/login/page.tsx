import { Fuel } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import { LanguageToggle } from '@/components/LanguageToggle'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const t = await getT()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand text-white">
            <Fuel className="size-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('app.name')}</h1>
          <p className="mt-1 text-muted">{t('app.tagline')}</p>
        </div>

        <LoginForm />

        <div className="mt-8 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </main>
  )
}
