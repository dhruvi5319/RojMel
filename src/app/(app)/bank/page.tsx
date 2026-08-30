import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money, todayIST } from '@/lib/format'
import type { BankDeposit, CashPosition, Profile } from '@/lib/database.types'
import { Card, Empty, PageHeader, Stat, TableWrap, Td, Th } from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { Collapsible } from '@/components/Collapsible'
import { DepositForm } from './DepositForm'
import { deleteDeposit } from './actions'

export const dynamic = 'force-dynamic'

interface Row extends BankDeposit {
  profiles: { full_name: string } | null
}

export default async function BankPage() {
  const { profile } = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()

  const [depositsRes, cashRes, peopleRes] = await Promise.all([
    supabase
      .from('bank_deposits')
      .select('*, profiles!bank_deposits_deposited_by_fkey(full_name)')
      .order('deposit_date', { ascending: false })
      .limit(200),
    supabase.rpc('cash_position'),
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
  ])

  const rows = (depositsRes.data ?? []) as unknown as Row[]
  const cash = (cashRes.data ?? null) as CashPosition | null
  const people = (peopleRes.data ?? []) as Profile[]

  const thisMonth = rows
    .filter((r) => r.deposit_date.slice(0, 7) === today.slice(0, 7))
    .reduce((s, r) => s + Number(r.amount), 0)

  return (
    <>
      <PageHeader title={t('bank.title')} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label={t('bank.undeposited')}
          value={money(cash?.in_hand ?? 0)}
          hint={t('dash.cashInHand')}
          tone="accent"
        />
        <Stat label="This month" value={money(thisMonth)} />
        <Stat label={t('common.total')} value={money(cash?.deposited ?? 0)} tone="ok" />
      </div>

      <div className="mb-4">
        <Collapsible title={t('bank.new')}>
          <DepositForm
            today={today}
            people={people}
            defaultDepositor={profile.id}
            suggestedAmount={cash?.in_hand ?? 0}
          />
        </Collapsible>
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.date')}</Th>
                <Th>{t('bank.bankName')}</Th>
                <Th>{t('bank.slip')}</Th>
                <Th>{t('bank.depositedBy')}</Th>
                <Th className="text-right">{t('common.amount')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <EditableRow
                  key={d.id}
                  span={5}
                  label={`Edit ${d.bank_name} deposit`}
                  cells={
                    <>
                      <Td className="whitespace-nowrap">{formatDate(d.deposit_date)}</Td>
                      <Td>
                        <span className="font-medium">{d.bank_name}</span>
                        {d.account_last4 ? (
                          <span className="ml-2 tabular text-sm text-muted">
                            ••{d.account_last4}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-muted">{d.slip_reference ?? '—'}</Td>
                      <Td className="text-muted">{d.profiles?.full_name ?? '—'}</Td>
                      <Td className="tabular text-right font-semibold">
                        {money(d.amount)}
                      </Td>
                    </>
                  }
                  actions={
                    <DeleteButton
                      action={deleteDeposit}
                      fields={{ id: d.id }}
                      label="Delete deposit"
                    />
                  }
                  form={
                    <DepositForm
                      today={today}
                      people={people}
                      defaultDepositor={profile.id}
                      suggestedAmount={0}
                      deposit={d}
                    />
                  }
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
