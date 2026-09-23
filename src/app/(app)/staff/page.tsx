import { requireBackOffice , pumpToday } from '@/lib/auth'
import { rotationRoleOn, shiftLabel } from '@/lib/shifts'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import {formatDate, money, monthEnd} from '@/lib/format'
import type { Staff, StaffPayment, StaffWork } from '@/lib/database.types'
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
  const session = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const today = pumpToday(session)
  const month = (await searchParams).month || today.slice(0, 7)

  const [staffRes, paymentsRes, workRes] = await Promise.all([
    supabase.from('staff').select('*').order('is_active', { ascending: false }).order('name'),
    supabase
      .from('staff_payments')
      .select('*, staff(name)')
      .gte('payment_date', `${month}-01`)
      .lte('payment_date', monthEnd(`${month}-01`))
      .order('payment_date', { ascending: false }),
    // What the counter has recorded about each of them this month.
    supabase.from('v_staff_work').select('*'),
  ])

  const staff = (staffRes.data ?? []) as Staff[]
  const active = staff.filter((s) => s.is_active)
  const departed = staff.filter((s) => !s.is_active)
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[]
  const work = (workRes.data ?? []) as StaffWork[]
  const workOf = (id: string) => work.find((w) => w.staff_id === id)

  // A deduction reduces what is owed rather than adding to what was paid out.
  const paidOut = payments
    .filter((p) => p.type !== 'deduction')
    .reduce((s, p) => s + Number(p.amount), 0)
  const salaryBill = active.reduce((s, m) => s + Number(m.monthly_salary), 0)

  return (
    <>
      <PageHeader title={t('staff.title')} action={<MonthPicker month={month} />} />

      {/* Two salary figures sat side by side with nothing to say how they
          related. One is what the pump owes every month; the other is what
          actually went out of the box this one. */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('staff.workingHere')} value={String(active.length)} />
        <Stat
          label={t('staff.monthlyBill')}
          value={money(salaryBill)}
          hint={t('staff.monthlyBillHint')}
        />
        <Stat
          label={t('staff.paidThisMonth')}
          value={money(paidOut)}
          hint={
            salaryBill > 0
              ? `${t('staff.ofTheBill')} ${Math.round((paidOut / salaryBill) * 100)}%`
              : undefined
          }
          tone="accent"
        />
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
        <CardHeader title={t('staff.workingHere')} subtitle={t('staff.thisMonthHint')} />
        {active.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-divider">
            {active.map((m) => (
              <details key={m.id} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {m.name}
                      {m.name_gu ? (
                        <span className="text-neutral-600">({m.name_gu})</span>
                      ) : null}
                    </div>
                    {/* What the counter says they did, which the office could
                        not see at all until now. */}
                    <div className="tabular text-[12.5px] text-neutral-700">
                      {(() => {
                        const w = workOf(m.id)
                        // "Normally on" has no single stored answer for a
                        // rotating filler, so it is worked out for the week
                        // being looked at rather than read off a column.
                        const roster = m.rotates
                          ? m.rotation_role && m.rotation_set_on
                            ? rotationRoleOn(
                                m.rotation_role as 'Day' | 'Night',
                                m.rotation_set_on,
                                today,
                              )
                            : null
                          : m.default_shift
                        const bits = [
                          roster
                            ? `${shiftLabel(t, roster)}${m.rotates ? ` (${t('staff.thisWeek').toLowerCase()})` : ''}`
                            : null,
                          w && w.shifts_this_month > 0
                            ? `${w.shifts_this_month} ${
                                w.shifts_this_month === 1 ? t('staff.shift') : t('staff.shifts')
                              }`
                            : t('staff.noShiftsThisMonth'),
                          w && Number(w.cash_this_month) > 0
                            ? `${t('shift.cashHandedOver')} ${money(w.cash_this_month)}`
                            : null,
                          w && w.slips_this_month > 0
                            ? `${w.slips_this_month} ${t('credit.title').toLowerCase()}`
                            : null,
                          m.phone,
                        ].filter(Boolean)
                        return bits.join(' · ')
                      })()}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular font-semibold">{money(m.monthly_salary)}</div>
                    <div className="text-[12px] text-neutral-700">{t('staff.perMonth')}</div>
                  </div>
                </summary>
                <div className="border-t border-divider bg-neutral-200 p-4">
                  <EditStaffForm member={m} today={today} />
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      {/* People who have left keep their name on shifts, slips and the audit
          trail, so they stay in the book — but they are not the payroll. */}
      {departed.length > 0 ? (
        <div className="mt-4">
          <Card>
            <CardHeader title={t('staff.haveLeft')} subtitle={t('staff.haveLeftHint')} />
            <div className="flex flex-col divide-y divide-divider">
              {departed.map((m) => (
                <details key={m.id} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="font-medium text-neutral-800">{m.name}</span>
                      {m.name_gu ? (
                        <span className="ml-1 text-neutral-700">({m.name_gu})</span>
                      ) : null}
                      <span className="tabular ml-2 text-[12.5px] text-neutral-700">
                        {workOf(m.id)?.last_worked
                          ? `${t('staff.lastWorked')} ${formatDate(workOf(m.id)!.last_worked)}`
                          : ''}
                      </span>
                    </span>
                    <Badge>{t('staff.left')}</Badge>
                  </summary>
                  <div className="border-t border-divider bg-neutral-200 p-4">
                    <EditStaffForm member={m} today={today} />
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

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
