import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canCreateLogins } from '@/lib/supabase/admin'
import { getT } from '@/lib/i18n/server'
import { formatDate } from '@/lib/format'
import type { UserRole } from '@/lib/database.types'
import {
  Alert, Badge, Card, Empty, PageHeader, TableWrap, Td, Th,
} from '@/components/ui'
import { Collapsible } from '@/components/Collapsible'
import { EditableRow } from '@/components/EditableRow'
import { AccountActive, AddAccountForm, ResetPasswordForm } from './PeopleForms'

export const dynamic = 'force-dynamic'

interface Account {
  user_id: string
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  is_active: boolean
  is_me: boolean
  created_at: string
}

const roleKey = {
  owner: 'role.owner',
  manager: 'role.manager',
  counter: 'role.counter',
} as const

/**
 * Who can sign in, and who decides.
 *
 * Nobody signs themselves up — this is a pump, not a website. The super admin
 * makes the pump and its first owner; the owner keeps the office accounts,
 * because managers change and waiting on an administrator for that is how a
 * pump ends up sharing one password. The fillers have no login at all.
 */
export default async function PeoplePage() {
  const session = await requireBackOffice()
  const owner = isOwner(session)
  const t = await getT()
  const supabase = await createClient()

  const { data } = await supabase.rpc('office_accounts')
  const accounts = (data ?? []) as Account[]

  return (
    <>
      <PageHeader title={t('acc.title')} subtitle={t('acc.subtitle')} />

      <div className="mb-5">
        <Alert tone="accent">{t('acc.chain')}</Alert>
      </div>

      {owner && !canCreateLogins() ? (
        <div className="mb-5">
          <Alert tone="danger">{t('acc.noServiceKey')}</Alert>
        </div>
      ) : null}

      {owner && canCreateLogins() ? (
        <div className="mb-5">
          <Collapsible title={t('acc.add')}>
            <AddAccountForm />
          </Collapsible>
        </div>
      ) : null}

      <Card className="overflow-hidden pb-1">
        {accounts.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('acc.email')}</Th>
                <Th>{t('acc.role')}</Th>
                <Th>{t('common.status')}</Th>
                {owner ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const cells = (
                  <>
                    <Td className="font-medium">
                      {a.full_name}
                      {a.is_me ? (
                        <span className="ml-2">
                          <Badge tone="accent">{t('acc.you')}</Badge>
                        </span>
                      ) : null}
                      {a.phone ? (
                        <div className="text-sm text-neutral-600">{a.phone}</div>
                      ) : null}
                    </Td>
                    <Td className="text-neutral-600">{a.email}</Td>
                    <Td>
                      <Badge tone={a.role === 'owner' ? 'ok' : 'neutral'}>
                        {t(roleKey[a.role])}
                      </Badge>
                    </Td>
                    <Td className="text-neutral-600">
                      {a.is_active ? formatDate(a.created_at) : t('acc.removed')}
                    </Td>
                  </>
                )

                // Only an owner keeps the list, and never edits themselves out
                // of it — the database refuses that too.
                return owner && !a.is_me ? (
                  <EditableRow
                    key={a.user_id}
                    span={4}
                    label={`Set a new password for ${a.full_name}`}
                    cells={cells}
                    actions={<AccountActive userId={a.user_id} active={a.is_active} />}
                    form={<ResetPasswordForm userId={a.user_id} />}
                  />
                ) : (
                  <tr key={a.user_id}>
                    {cells}
                    {owner ? <Td /> : null}
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
