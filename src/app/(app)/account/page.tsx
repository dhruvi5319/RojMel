import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui'
import { ChangePasswordForm } from './AccountForms'

export const dynamic = 'force-dynamic'

const roleKey = {
  owner: 'role.owner',
  manager: 'role.manager',
  counter: 'role.counter',
} as const

/** Your own login. Everyone with an account can change their own password. */
export default async function AccountPage() {
  const session = await requireSession()
  const t = await getT()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <>
      <PageHeader title={t('nav.account')} subtitle={session.station.name} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('acc.signedInAs')} />
          <div className="flex flex-col gap-2 p-5">
            <div className="text-[17px] font-semibold">{session.profile.full_name}</div>
            <div className="text-neutral-600">{user?.email}</div>
            <div>
              <Badge tone="accent">{t(roleKey[session.profile.role])}</Badge>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('acc.myPassword')} />
          <div className="p-5">
            <ChangePasswordForm />
          </div>
        </Card>
      </div>
    </>
  )
}
