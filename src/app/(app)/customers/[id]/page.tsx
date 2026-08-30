import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, Receipt } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, litres, money } from '@/lib/format'
import type {
  CreditSale, Customer, CustomerBalance, Invoice, Payment, Vehicle,
} from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, LinkButton, PageHeader, Stat,
  TableWrap, Td, Th,
} from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { CustomerFields } from '../CustomerFields'
import { addVehicle, removeVehicle, updateCustomer } from '../actions'

export const dynamic = 'force-dynamic'

/** One line of the statement, whichever side of the ledger it came from. */
interface LedgerRow {
  date: string
  kind: 'sale' | 'payment'
  detail: string
  debit: number
  credit: number
}

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireBackOffice()
  const { id } = await params
  const t = await getT()
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle<Customer>()

  if (!customer) notFound()

  const [balanceRes, vehiclesRes, salesRes, paymentsRes, invoicesRes] =
    await Promise.all([
      supabase
        .from('v_customer_balances')
        .select('*')
        .eq('customer_id', id)
        .maybeSingle<CustomerBalance>(),
      supabase
        .from('vehicles')
        .select('*')
        .eq('customer_id', id)
        .eq('is_active', true)
        .order('vehicle_number'),
      supabase
        .from('credit_sales')
        .select('*')
        .eq('customer_id', id)
        .order('business_date', { ascending: false })
        .limit(200),
      supabase
        .from('payments')
        .select('*')
        .eq('customer_id', id)
        .order('payment_date', { ascending: false })
        .limit(200),
      supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', id)
        .order('issue_date', { ascending: false })
        .limit(24),
    ])

  const balance = balanceRes.data
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[]
  const sales = (salesRes.data ?? []) as CreditSale[]
  const payments = (paymentsRes.data ?? []) as Payment[]
  const invoices = (invoicesRes.data ?? []) as Invoice[]

  // Build the statement oldest-first so the running balance reads correctly,
  // then show it newest-first the way a ledger page is actually read.
  const entries: LedgerRow[] = [
    ...sales.map((s) => ({
      date: s.business_date,
      kind: 'sale' as const,
      detail: [s.vehicle_number, s.slip_number && `#${s.slip_number}`, litres(s.litres)]
        .filter(Boolean)
        .join(' · '),
      debit: Number(s.amount),
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: p.payment_date,
      kind: 'payment' as const,
      detail: [p.mode, p.reference].filter(Boolean).join(' · '),
      debit: 0,
      credit: Number(p.amount),
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const ledger = entries
    .reduce<(LedgerRow & { running: number })[]>((acc, e) => {
      const previous = acc.at(-1)?.running ?? Number(customer.opening_balance)
      acc.push({ ...e, running: previous + e.debit - e.credit })
      return acc
    }, [])
    .reverse()

  const over =
    customer.credit_limit > 0 && (balance?.balance ?? 0) > customer.credit_limit

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={[customer.contact_person, customer.phone]
          .filter(Boolean)
          .join(' · ')}
        action={
          <>
            <LinkButton href={`/credit/new?customer=${id}`} size="sm">
              <Plus className="size-4" aria-hidden />
              {t('credit.new')}
            </LinkButton>
            <LinkButton href={`/invoices/new?customer=${id}`} variant="secondary" size="sm">
              <Receipt className="size-4" aria-hidden />
              {t('inv.new')}
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('cust.balance')}
          value={money(balance?.balance ?? 0)}
          tone={over ? 'danger' : 'accent'}
        />
        <Stat
          label={t('credit.unbilled')}
          value={money(balance?.unbilled_amount ?? 0)}
          hint={`${balance?.unbilled_slips ?? 0} ${t('nav.credit')}`}
        />
        <Stat label={t('cust.creditLimit')} value={money(customer.credit_limit)} />
        <Stat
          label={t('cust.lastPayment')}
          value={formatDate(balance?.last_payment_date)}
          hint={money(balance?.lifetime_paid ?? 0)}
        />
      </div>

      {over ? (
        <div className="mt-4">
          <Alert tone="danger">{t('credit.overLimit')}</Alert>
        </div>
      ) : null}

      {/* ------------------------------------------------------ vehicles -- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('cust.vehicles')} />
          {vehicles.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <Td className="font-medium tabular">{v.vehicle_number}</Td>
                    <Td className="text-neutral-600">{v.driver_name ?? '—'}</Td>
                    <Td className="text-right">
                      <DeleteButton
                        action={removeVehicle}
                        fields={{ id: v.id, customer_id: id }}
                        label={`Remove ${v.vehicle_number}`}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <div className="border-t border-divider p-4">
            <ActionForm
              action={addVehicle}
              className="flex flex-col gap-3"
              resetOnSuccess
            >
              <input type="hidden" name="customer_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="vehicle_number"
                  required
                  placeholder={t('cust.vehicleNo')}
                  className="tabular w-full rounded-lg border border-divider bg-surface px-3 py-2.5 uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
                <input
                  name="driver_name"
                  placeholder={t('credit.driver')}
                  className="w-full rounded-lg border border-divider bg-surface px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </div>
              <div>
                <SubmitButton size="md">{t('cust.addVehicle')}</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </Card>

        {/* ---------------------------------------------------- invoices -- */}
        <Card>
          <CardHeader title={t('inv.title')} />
          {invoices.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('inv.number')}</Th>
                  <Th>{t('inv.period')}</Th>
                  <Th className="text-right">{t('common.total')}</Th>
                  <Th>{t('common.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <Td>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="tabular font-medium hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                    </Td>
                    <Td className="text-sm text-neutral-600">
                      {formatDate(inv.period_from)} – {formatDate(inv.period_to)}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {money(inv.total)}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          inv.status === 'paid'
                            ? 'ok'
                            : inv.status === 'cancelled'
                              ? 'neutral'
                              : inv.status === 'partly_paid'
                                ? 'accent'
                                : 'accent'
                        }
                      >
                        {t(`inv.${inv.status}`)}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      {/* -------------------------------------------------------- ledger -- */}
      <div className="mt-6">
        <Card>
          <CardHeader
            title={t('cust.ledger')}
            subtitle={`${t('cust.openingBalance')}: ${money(customer.opening_balance)}`}
          />
          {ledger.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('common.description')}</Th>
                  <Th className="text-right">{t('nav.credit')}</Th>
                  <Th className="text-right">{t('nav.payments')}</Th>
                  <Th className="text-right">{t('cust.balance')}</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row, i) => (
                  <tr key={i}>
                    <Td className="whitespace-nowrap">{formatDate(row.date)}</Td>
                    <Td className="text-neutral-600">{row.detail || '—'}</Td>
                    <Td className="tabular text-right">
                      {row.debit ? money(row.debit) : '—'}
                    </Td>
                    <Td className="tabular text-right text-accent-2-700">
                      {row.credit ? money(row.credit) : '—'}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {money(row.running)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------- edit -- */}
      <div className="mt-6">
        <Card>
          <CardHeader title={t('common.edit')} />
          <div className="p-5">
            <ActionForm action={updateCustomer} onDone={t('counter.done')}>
              <input type="hidden" name="id" value={id} />
              <CustomerFields customer={customer} />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={customer.is_active}
                  className="size-4 accent-[var(--brand)]"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
              <div>
                <SubmitButton>{t('common.save')}</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  )
}
