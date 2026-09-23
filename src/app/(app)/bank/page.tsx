import { requireBackOffice , pumpToday } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import {formatDate, money} from '@/lib/format'
import type { BankDeposit, CashPosition, Profile } from '@/lib/database.types'
import { Alert, Card, Empty, PageHeader, Stat, TableWrap, Td, Th } from '@/components/ui'
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
  const session = await requireBackOffice()
  const { profile } = session
  const t = await getT()
  const supabase = await createClient()
  const today = pumpToday(session)

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

  /*
   * The box is a position, and a position can be wrong. It printed a negative
   * figure without comment — and less than nothing cannot be in a cash box, so
   * that is the books disagreeing with the room, not a small balance. A large
   * one is a different problem: money nobody has taken to the bank.
   */
  const inHand = Number(cash?.in_hand ?? 0)
  const lastDeposit = rows[0]?.deposit_date ?? null
  const daysSince = lastDeposit
    ? Math.round(
        (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastDeposit}T12:00:00Z`)) / 86400000,
      )
    : null
  const impossible = inHand < 0
  const tooMuch = inHand >= 150000

  return (
    <>
      <PageHeader title={t('bank.title')} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label={t('bank.undeposited')}
          value={money(inHand)}
          hint={t('dash.cashInHand')}
          tone={impossible ? 'danger' : 'accent'}
        />
        <Stat label={t('bank.thisMonth')} value={money(thisMonth)} />
        <Stat label={t('common.total')} value={money(cash?.deposited ?? 0)} tone="ok" />
      </div>

      {impossible ? (
        <div className="mb-5">
          <Alert tone="danger">
            <strong>{t('bank.impossible')}</strong> {t('bank.impossibleWhy')}
          </Alert>
        </div>
      ) : tooMuch ? (
        <div className="mb-5">
          <Alert tone="accent">
            <strong>{money(inHand)}</strong> {t('bank.tooMuchToKeep')}
            {daysSince != null && daysSince > 0
              ? ` ${t('bank.lastDeposited')} ${daysSince} ${t('stock.daysAgo')}.`
              : ''}
          </Alert>
        </div>
      ) : null}

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
                          <span className="ml-2 tabular text-sm text-neutral-600">
                            ••{d.account_last4}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-neutral-600">{d.slip_reference ?? '—'}</Td>
                      <Td className="text-neutral-600">{d.profiles?.full_name ?? '—'}</Td>
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
