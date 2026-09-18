'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/client'
import { Alert, Button, Card, Field, Input } from '@/components/ui'

export function LoginForm() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const removed = params.get('removed') === '1'

  // Their account was removed, or never belonged to a pump. The session is
  // still valid as far as Supabase is concerned, so it has to be ended here
  // or every page they open will bounce them back.
  useEffect(() => {
    if (removed) void createClient().auth.signOut()
  }, [removed])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setError(t('auth.failed'))
      setBusy(false)
      return
    }

    router.push(params.get('next') || '/')
    router.refresh()
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {removed ? <Alert tone="accent">{t('auth.noAccess')}</Alert> : null}
        <Field label={t('auth.email')} required>
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label={t('auth.password')} required>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>
    </Card>
  )
}
