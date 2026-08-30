import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money, todayIST } from '@/lib/format'
import type { Staff, StaffPayment } from '@/lib/database.types'
import {
  Badge, Card, CardHeader, Empty, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { EditStaffPaymentForm } from './EditStaffPaymentForm'
import { Collapsible } from '@/components/Collapsible'
import { MonthPicker } from '@/components/MonthPicker'
import { AddStaffForm, EditStaffForm, PayStaffForm } from './StaffForms'
import { deleteStaffPayment } from './actions'

export const dynamic = 'force-dynamic'

interface PaymentRow extends StaffPayment {
  staff: { name: string } | null
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()
  const month = (await searchParams).month || today.slice(0, 7)

  const [staffRes, paymentsRes] = await Promise.all([
    supabase.from('staff').select('*').order('is_active', { ascending: false }).order('name'),
    supabase
      .from('staff_payments')
      .select('*, staff(name)')
      .gte('payment_date', `${month}-01`)
      .lte('payment_date', `${month}-31`)
      .order('payment_date', { ascending: false }),
  ])

  const staff = (staffRes.data ?? []) as Staff[]
  const active = staff.filter((s) => s.is_active)
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[]

  // A deduction reduces what is owed rather than adding to what was paid out.
  const paidOut = payments
    .filter((p) => p.type !== 'deduction')
    .reduce((s, p) => s + Number(p.amount), 0)
  const salaryBill = active.reduce((s, m) => s + Number(m.monthly_salary), 0)

  return (
    <>
      <PageHeader title={t('staff.title')} action={<MonthPicker month={month} />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('staff.title')} value={String(active.length)} />
        <Stat label={t('staff.salary')} value={money(salaryBill)} hint="Per month" />
        <Stat label={t('staff.payments')} value={money(paidOut)} tone="accent" />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <Collapsible title={t('staff.new')}>
          <AddStaffForm />
        </Collapsible>
        {active.length > 0 ? (
          <Collapsible title={t('staff.pay')}>
            <PayStaffForm staff={active} today={today} />
          </Collapsible>
        ) : null}
      </div>

      <Card>
        <CardHeader title={t('staff.title')} />
        {staff.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-divider">
            {staff.map((m) => (
              <details key={m.id} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {m.name}
                      {m.name_gu ? (
                        <span className="text-neutral-600">({m.name_gu})</span>
                      ) : null}
                      {!m.is_active ? <Badge>Left</Badge> : null}
                      {m.pin ? <Badge tone="accent">PIN set</Badge> : null}
                    </div>
                    <div className="text-sm text-neutral-600">
                      {[m.phone, m.joined_on ? formatDate(m.joined_on) : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="tabular shrink-0 text-right font-semibold">
                    {money(m.monthly_salary)}
                  </div>
                </summary>
                <div className="border-t border-divider bg-neutral-200 p-4">
                  <EditStaffForm member={m} />
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader title={t('staff.payments')} />
          {payments.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('staff.title')}</Th>
                  <Th>{t('common.category')}</Th>
                  <Th>{t('staff.month')}</Th>
                  <Th className="text-right">{t('common.amount')}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <EditableRow
                    key={p.id}
                    span={5}
                    label="Edit payment"
                    cells={<>
                    <Td className="whitespace-nowrap">{formatDate(p.payment_date)}</Td>
                    <Td className="font-medium">{p.staff?.name ?? '—'}</Td>
                    <Td>
                      <Badge tone={p.type === 'deduction' ? 'danger' : 'neutral'}>
                        {t(`staff.type.${p.type}`)}
                      </Badge>
                    </Td>
                    <Td className="text-neutral-600">
                      {p.period_month ? p.period_month.slice(0, 7) : '—'}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {money(p.amount)}
                    </Td>
                    </>}
                    actions={
                      <DeleteButton
                        action={deleteStaffPayment}
                        fields={{ id: p.id }}
                        label="Delete payment"
                      />
                    }
                    form={<EditStaffPaymentForm payment={p} />}
                  />
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
