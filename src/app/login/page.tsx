import { Fuel } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import { LanguageSeg } from '@/components/AppNav'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const t = await getT()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-bg">
            <Fuel className="size-7" aria-hidden />
          </span>
          <div>
            {/* The wordmark stays Gujarati in both languages — it is the name. */}
            <div className="font-[family-name:var(--font-gujarati)] text-[30px] leading-tight">
              રોજમેળ
            </div>
            <div className="text-[13px] text-neutral-600">{t('app.tagline')}</div>
          </div>
        </div>

        <LoginForm />

        <div className="mt-7 flex justify-center">
          <LanguageSeg />
        </div>
      </div>
    </main>
  )
}
