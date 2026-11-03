import Link from 'next/link'
import { Fuel } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canCreateLogins } from '@/lib/supabase/admin'
import { getT } from '@/lib/i18n/server'
import { formatDate } from '@/lib/format'
import {
  Alert, Badge, Card, CardHeader, Empty, TableWrap, Td, Th,
} from '@/components/ui'
import { Collapsible } from '@/components/Collapsible'
import { EditableRow } from '@/components/EditableRow'
import { SignOutButton } from '@/components/SignOutButton'
import { PumpForm } from './PumpForm'
import {
  EditPumpForm, PumpAccountList, PumpActive,
  type AdminAccount, type AdminPump,
} from './PumpAdminForms'

export const dynamic = 'force-dynamic'

/**
 * The super admin's whole job: make a pump, and give it an owner who can then
 * run it without them.
 *
 * Deliberately outside the app shell. This account belongs to no pump, sees no
 * pump's books, and has no business looking at a day's takings — it can create
 * a station and its first owner, and that is all the database lets it do.
 */
export default async function AdminPage() {
  const admin = await requirePlatformAdmin()
  const t = await getT()
  const supabase = await createClient()

  const { data } = await supabase.rpc('admin_list_pumps')
  const pumps = (data ?? []) as AdminPump[]

  // Who can sign into each pump, fetched alongside it — the super admin's
  // list is never long enough that this is worth lazy-loading per row.
  const accountsByStation = new Map<string, AdminAccount[]>()
  if (pumps.length > 0) {
    const results = await Promise.all(
      pumps.map((p) => supabase.rpc('admin_pump_accounts', { p_station_id: p.station_id })),
    )
    pumps.forEach((p, i) => {
      accountsByStation.set(p.station_id, (results[i].data ?? []) as AdminAccount[])
    })
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-bg">
            <Fuel className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-2xl">
              {t('app.name')}
            </h1>
            <p className="text-[13px] text-neutral-600">
              {t('acc.superAdmin')} · {admin.email}
            </p>
          </div>
        </div>
        <SignOutButton />
      </div>

      {!canCreateLogins() ? (
        <div className="mb-5">
          <Alert tone="danger">{t('acc.noServiceKey')}</Alert>
        </div>
      ) : (
        <div className="mb-5">
          <Collapsible title={t('acc.newPump')}>
            <PumpForm />
          </Collapsible>
        </div>
      )}

      <Card className="overflow-hidden pb-1">
        <CardHeader title={t('acc.pumps')} />
        {pumps.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('acc.pumpName')}</Th>
                <Th>{t('acc.ownersManagers')}</Th>
                <Th>{t('role.counter')}</Th>
                <Th>{t('common.date')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pumps.map((p) => {
                const cells = (
                  <>
                    <Td>
                      <span className="font-semibold">{p.name}</span>
                      {p.city ? (
                        <div className="text-sm text-neutral-600">{p.city}</div>
                      ) : null}
                    </Td>
                    <Td className="tabular text-neutral-600">
                      {Number(p.owners)} · {Number(p.managers)}
                    </Td>
                    <Td>
                      <Badge tone={p.has_counter ? 'ok' : 'neutral'}>
                        {p.has_counter ? t('acc.counterSet') : t('acc.counterMissing')}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-neutral-600">
                      {p.is_active ? formatDate(p.created_at) : t('acc.removed')}
                    </Td>
                  </>
                )
                return (
                  <EditableRow
                    key={p.station_id}
                    span={5}
                    label={`Edit ${p.name}`}
                    cells={cells}
                    actions={<PumpActive stationId={p.station_id} active={p.is_active} />}
                    form={
                      <div className="flex flex-col gap-5">
                        <div>
                          <div className="mb-2 text-[13px] font-semibold text-neutral-700">
                            {t('acc.pumpDetails')}
                          </div>
                          <EditPumpForm pump={p} />
                        </div>
                        <div>
                          <div className="mb-2 text-[13px] font-semibold text-neutral-700">
                            {t('acc.pumpAccounts')}
                          </div>
                          <PumpAccountList accounts={accountsByStation.get(p.station_id) ?? []} />
                        </div>
                        <p className="text-[12.5px] text-neutral-600">
                          {t('acc.retirePumpHint')}
                        </p>
                      </div>
                    }
                  />
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <p className="mt-5 text-[12.5px] text-neutral-600">
        {t('acc.chain')}{' '}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </main>
  )
}
