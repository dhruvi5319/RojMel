import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong, litres, money, todayIST } from '@/lib/format'
import type { CreditSale } from '@/lib/database.types'
import {
  Badge, Card, Empty, LinkButton, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { EditSlipForm } from './EditSlipForm'
import { DateNav } from '@/components/DateNav'
import { deleteCreditSale } from './actions'

export const dynamic = 'force-dynamic'

interface Row extends CreditSale {
  customers: { name: string } | null
  fuel_types: { name: string } | null
}

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const date = (await searchParams).date || todayIST()

  const { data } = await supabase
    .from('credit_sales')
    .select('*, customers(name), fuel_types(name)')
    .eq('business_date', date)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as Row[]
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const totalLitres = rows.reduce((s, r) => s + Number(r.litres), 0)

  return (
    <>
      <PageHeader
        title={t('credit.title')}
        subtitle={formatDateLong(date)}
        action={
          <>
            <DateNav date={date} />
            <LinkButton href={`/credit/new?date=${date}`}>
              <Plus className="size-4" aria-hidden />
              {t('credit.new')}
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('dash.creditGiven')} value={money(total)} tone="accent" />
        <Stat label={t('common.litres')} value={litres(totalLitres)} />
        <Stat label={t('credit.slipNo')} value={String(rows.length)} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('cust.title')}</Th>
                <Th>{t('credit.vehicle')}</Th>
                <Th>{t('common.fuel')}</Th>
                <Th className="text-right">{t('common.litres')}</Th>
                <Th className="text-right">{t('common.rate')}</Th>
                <Th className="text-right">{t('common.amount')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <EditableRow
                  key={r.id}
                  span={6}
                  label="Edit slip"
                  cells={<>
                  <Td>
                    <Link
                      href={`/customers/${r.customer_id}`}
                      className="font-medium hover:underline"
                    >
                      {r.customers?.name ?? '—'}
                    </Link>
                    {r.slip_number ? (
                      <div className="text-sm text-muted">#{r.slip_number}</div>
                    ) : null}
                  </Td>
                  <Td className="tabular">
                    {r.vehicle_number ?? '—'}
                    {r.driver_name ? (
                      <div className="text-sm text-muted">{r.driver_name}</div>
                    ) : null}
                  </Td>
                  <Td>{r.fuel_types?.name ?? '—'}</Td>
                  <Td className="tabular text-right">{litres(r.litres)}</Td>
                  <Td className="tabular text-right text-muted">
                    {Number(r.sale_rate).toFixed(2)}
                  </Td>
                  <Td className="tabular text-right font-semibold">
                    {money(r.amount)}
                  </Td>
                  </>}
                  actions={
                    r.invoice_id ? (
                      <Badge tone="ok">{t('credit.billed')}</Badge>
                    ) : (
                      <DeleteButton
                        action={deleteCreditSale}
                        fields={{ id: r.id }}
                        label="Delete slip"
                      />
                    )
                  }
                  form={<EditSlipForm slip={r} />}
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
