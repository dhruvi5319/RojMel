import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money, todayIST } from '@/lib/format'
import type { Expense } from '@/lib/database.types'
import { Card, Empty, PageHeader, Stat, TableWrap, Td, Th } from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { Collapsible } from '@/components/Collapsible'
import { MonthPicker } from '@/components/MonthPicker'
import { ExpenseForm } from './ExpenseForm'
import { deleteExpense } from './actions'

export const dynamic = 'force-dynamic'

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()
  const month = (await searchParams).month || today.slice(0, 7)

  const { data } = await supabase
    .from('expenses')
    .select('*')
    .gte('business_date', `${month}-01`)
    .lte('business_date', `${month}-31`)
    .order('business_date', { ascending: false })

  const rows = (data ?? []) as Expense[]
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const cash = rows
    .filter((r) => r.mode === 'cash')
    .reduce((s, r) => s + Number(r.amount), 0)

  const byCategory = new Map<string, number>()
  for (const r of rows) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + Number(r.amount))
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <>
      <PageHeader
        title={t('exp.title')}
        action={<MonthPicker month={month} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('common.total')} value={money(total)} tone="accent" />
        <Stat label={t('mode.cash')} value={money(cash)} />
        <Stat
          label={t('common.category')}
          value={top[0] ? money(top[0][1]) : '—'}
          hint={top[0]?.[0]}
        />
      </div>

      <div className="mb-4">
        <Collapsible title={t('exp.new')}>
          <ExpenseForm today={today} />
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
                <Th>{t('common.category')}</Th>
                <Th>{t('exp.paidTo')}</Th>
                <Th>{t('common.mode')}</Th>
                <Th className="text-right">{t('common.amount')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <EditableRow
                  key={e.id}
                  span={5}
                  label={`Edit ${e.category}`}
                  cells={
                    <>
                      <Td className="whitespace-nowrap">{formatDate(e.business_date)}</Td>
                      <Td>
                        <span className="font-medium">{e.category}</span>
                        {e.description ? (
                          <div className="text-sm text-neutral-600">{e.description}</div>
                        ) : null}
                      </Td>
                      <Td className="text-neutral-600">{e.paid_to ?? '—'}</Td>
                      <Td>{t(`mode.${e.mode}`)}</Td>
                      <Td className="tabular text-right font-semibold">
                        {money(e.amount)}
                      </Td>
                    </>
                  }
                  actions={
                    <DeleteButton
                      action={deleteExpense}
                      fields={{ id: e.id }}
                      label="Delete expense"
                    />
                  }
                  form={<ExpenseForm today={today} expense={e} />}
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
