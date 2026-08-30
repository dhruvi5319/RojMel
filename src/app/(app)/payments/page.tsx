import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money } from '@/lib/format'
import type { Payment } from '@/lib/database.types'
import {
  Badge, Card, Empty, LinkButton, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { EditPaymentForm } from './EditPaymentForm'
import { deletePayment } from './actions'

export const dynamic = 'force-dynamic'

interface Row extends Payment {
  customers: { name: string } | null
  invoices: { invoice_number: string } | null
}

export default async function PaymentsPage() {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()

  const { data } = await supabase
    .from('payments')
    .select('*, customers(name), invoices(invoice_number)')
    .order('payment_date', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Row[]
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const thisMonth = rows
    .filter((r) => r.payment_date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, r) => s + Number(r.amount), 0)

  return (
    <>
      <PageHeader
        title={t('pay.title')}
        action={
          <LinkButton href="/payments/new">
            <Plus className="size-4" aria-hidden />
            {t('pay.new')}
          </LinkButton>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={t('common.total')} value={money(total)} tone="ok" />
        <Stat label="This month" value={money(thisMonth)} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.date')}</Th>
                <Th>{t('cust.title')}</Th>
                <Th>{t('pay.against')}</Th>
                <Th>{t('common.mode')}</Th>
                <Th className="text-right">{t('common.amount')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <EditableRow
                  key={p.id}
                  span={5}
                  label="Edit payment"
                  cells={<>
                  <Td className="whitespace-nowrap">{formatDate(p.payment_date)}</Td>
                  <Td>
                    <Link
                      href={`/customers/${p.customer_id}`}
                      className="font-medium hover:underline"
                    >
                      {p.customers?.name ?? '—'}
                    </Link>
                  </Td>
                  <Td>
                    {p.invoices ? (
                      <Link
                        href={`/invoices/${p.invoice_id}`}
                        className="tabular hover:underline"
                      >
                        {p.invoices.invoice_number}
                      </Link>
                    ) : (
                      <Badge>{t('pay.onAccount')}</Badge>
                    )}
                  </Td>
                  <Td>
                    {t(`mode.${p.mode}`)}
                    {p.reference ? (
                      <div className="text-sm text-neutral-600">{p.reference}</div>
                    ) : null}
                  </Td>
                  <Td className="tabular text-right font-semibold">{money(p.amount)}</Td>
                  </>}
                  actions={
                    <DeleteButton
                      action={deletePayment}
                      fields={{ id: p.id }}
                      label="Delete payment"
                    />
                  }
                  form={<EditPaymentForm payment={p} />}
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
