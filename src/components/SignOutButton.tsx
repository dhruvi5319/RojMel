'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/client'

export function SignOutButton() {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={t('auth.signOut')}
      title={t('auth.signOut')}
      onClick={async () => {
        setBusy(true)
        await createClient().auth.signOut()
        router.push('/login')
        router.refresh()
      }}
      className="grid size-8 cursor-pointer place-items-center rounded-full text-neutral-600 transition hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] hover:text-text disabled:opacity-50"
    >
      <LogOut className="size-4" aria-hidden />
    </button>
  )
}
