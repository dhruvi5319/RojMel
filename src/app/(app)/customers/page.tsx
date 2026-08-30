import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money } from '@/lib/format'
import type { CustomerBalance } from '@/lib/database.types'
import {
  Badge, Card, Empty, LinkButton, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const q = (await searchParams).q?.trim() ?? ''

  let query = supabase
    .from('v_customer_balances')
    .select('*')
    .order('balance', { ascending: false })

  if (q) query = query.ilike('name', `%${q}%`)

  const { data } = await query
  const customers = (data ?? []) as CustomerBalance[]

  const totalOutstanding = customers.reduce((s, c) => s + Number(c.balance), 0)
  const totalUnbilled = customers.reduce((s, c) => s + Number(c.unbilled_amount), 0)
  const overLimit = customers.filter(
    (c) => c.credit_limit > 0 && c.balance > c.credit_limit,
  ).length

  return (
    <>
      <PageHeader
        title={t('cust.title')}
        action={
          <LinkButton href="/customers/new">
            <Plus className="size-4" aria-hidden />
            {t('cust.new')}
          </LinkButton>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('dash.outstanding')} value={money(totalOutstanding)} tone="accent" />
        <Stat label={t('credit.unbilled')} value={money(totalUnbilled)} />
        <Stat
          label={t('credit.overLimit')}
          value={String(overLimit)}
          tone={overLimit > 0 ? 'danger' : 'plain'}
        />
      </div>

      <form className="no-print mb-4" action="/customers">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t('common.search')}
          className="w-full max-w-sm rounded-lg border border-divider bg-surface px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </form>

      <Card>
        {customers.length === 0 ? (
          <Empty>{t('cust.noCustomers')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th className="text-right">{t('cust.balance')}</Th>
                <Th className="text-right">{t('credit.unbilled')}</Th>
                <Th className="text-right">{t('cust.creditLimit')}</Th>
                <Th>{t('cust.lastSale')}</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const over = c.credit_limit > 0 && c.balance > c.credit_limit
                return (
                  <tr key={c.customer_id}>
                    <Td>
                      <Link
                        href={`/customers/${c.customer_id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.phone ? (
                        <div className="text-sm text-neutral-600">{c.phone}</div>
                      ) : null}
                      {!c.is_active ? (
                        <span className="ml-2">
                          <Badge>Inactive</Badge>
                        </span>
                      ) : null}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {money(c.balance)}
                      {over ? (
                        <div className="mt-1">
                          <Badge tone="danger">{t('credit.overLimit')}</Badge>
                        </div>
                      ) : null}
                    </Td>
                    <Td className="tabular text-right">
                      {c.unbilled_amount > 0 ? (
                        <span>
                          {money(c.unbilled_amount)}
                          <span className="ml-1 text-sm text-neutral-600">
                            ({c.unbilled_slips})
                          </span>
                        </span>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </Td>
                    <Td className="tabular text-right text-neutral-600">
                      {c.credit_limit > 0 ? money(c.credit_limit) : '—'}
                    </Td>
                    <Td className="text-neutral-600">{formatDate(c.last_sale_date)}</Td>
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
