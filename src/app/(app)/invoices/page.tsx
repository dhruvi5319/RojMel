import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money } from '@/lib/format'
import type { Invoice, InvoiceStatus } from '@/lib/database.types'
import {
  Badge, Card, Empty, LinkButton, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

interface Row extends Invoice {
  customers: { name: string } | null
  payments: { amount: number }[]
}

export const STATUS_TONE: Record<InvoiceStatus, 'ok' | 'accent' | 'accent' | 'neutral'> = {
  paid: 'ok',
  issued: 'accent',
  partly_paid: 'accent',
  draft: 'neutral',
  cancelled: 'neutral',
}

export default async function InvoicesPage() {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()

  const { data } = await supabase
    .from('invoices')
    .select('*, customers(name), payments(amount)')
    .order('issue_date', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Row[]
  const live = rows.filter((r) => r.status !== 'cancelled')
  const billed = live.reduce((s, r) => s + Number(r.total), 0)
  const received = live.reduce(
    (s, r) => s + r.payments.reduce((a, p) => a + Number(p.amount), 0),
    0,
  )

  return (
    <>
      <PageHeader
        title={t('inv.title')}
        action={
          <LinkButton href="/invoices/new">
            <Plus className="size-4" aria-hidden />
            {t('inv.new')}
          </LinkButton>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('common.total')} value={money(billed)} />
        <Stat label={t('nav.payments')} value={money(received)} tone="ok" />
        <Stat label={t('cust.balance')} value={money(billed - received)} tone="accent" />
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('inv.number')}</Th>
                <Th>{t('cust.title')}</Th>
                <Th>{t('inv.period')}</Th>
                <Th className="text-right">{t('common.total')}</Th>
                <Th className="text-right">{t('cust.balance')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const paid = inv.payments.reduce((a, p) => a + Number(p.amount), 0)
                return (
                  <tr key={inv.id}>
                    <Td>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="tabular font-medium hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                      <div className="text-sm text-neutral-600">
                        {formatDate(inv.issue_date)}
                      </div>
                    </Td>
                    <Td>
                      <Link
                        href={`/customers/${inv.customer_id}`}
                        className="hover:underline"
                      >
                        {inv.customers?.name ?? '—'}
                      </Link>
                    </Td>
                    <Td className="text-sm text-neutral-600 whitespace-nowrap">
                      {formatDate(inv.period_from)} – {formatDate(inv.period_to)}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {money(inv.total)}
                    </Td>
                    <Td className="tabular text-right">
                      {inv.status === 'cancelled' ? '—' : money(Number(inv.total) - paid)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[inv.status]}>{t(`inv.${inv.status}`)}</Badge>
                    </Td>
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
