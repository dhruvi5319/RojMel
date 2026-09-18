import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong, money, quantity, todayIST } from '@/lib/format'
import type { CreditSale } from '@/lib/database.types'
import {
  Badge, Card, Empty, LinkButton, PageHeader, Stat, TableWrap, Td, Th,
} from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { shiftLabel } from '@/lib/shifts'
import { EditSlipForm } from './EditSlipForm'
import { deleteCreditSale } from './actions'

export const dynamic = 'force-dynamic'

interface Row extends CreditSale {
  customers: { name: string } | null
  fuel_types: { name: string; unit: 'L' | 'kg' } | null
  /** which half of the day this slip counts toward */
  shifts: { name: string } | null
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
    .select('*, customers(name), fuel_types(name, unit), shifts(name)')
    .eq('business_date', date)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as Row[]
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  // Litres and kilograms do not add up, so they are counted apart.
  const totalLitres = rows
    .filter((r) => r.fuel_types?.unit !== 'kg')
    .reduce((s, r) => s + Number(r.quantity), 0)
  const totalKg = rows
    .filter((r) => r.fuel_types?.unit === 'kg')
    .reduce((s, r) => s + Number(r.quantity), 0)

  return (
    <>
      <PageHeader
        title={t('credit.title')}
        subtitle={formatDateLong(date)}
        action={
          <>
            <LinkButton href={`/credit/new?date=${date}`}>
              <Plus className="size-4" aria-hidden />
              {t('credit.new')}
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('dash.creditGiven')} value={money(total)} tone="accent" />
        <Stat
          label={t('common.quantity')}
          value={quantity(totalLitres)}
          hint={totalKg > 0 ? quantity(totalKg, 'kg') : undefined}
        />
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
                <Th>{t('shift.name')}</Th>
                <Th>{t('common.fuel')}</Th>
                <Th className="text-right">{t('common.quantity')}</Th>
                <Th className="text-right">{t('common.rate')}</Th>
                <Th className="text-right">{t('common.amount')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <EditableRow
                  key={r.id}
                  span={7}
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
                      <div className="text-sm text-neutral-600">#{r.slip_number}</div>
                    ) : null}
                  </Td>
                  <Td className="tabular">
                    {r.vehicle_number ?? '—'}
                    {r.driver_name ? (
                      <div className="text-sm text-neutral-600">{r.driver_name}</div>
                    ) : null}
                  </Td>
                  <Td>
                    {r.shifts?.name ? (
                      <Badge tone="accent">{shiftLabel(t, r.shifts.name)}</Badge>
                    ) : (
                      <Badge tone="danger">{t('money.looseUdhaar')}</Badge>
                    )}
                  </Td>
                  <Td>{r.fuel_types?.name ?? '—'}</Td>
                  <Td className="tabular text-right">
                    {quantity(r.quantity, r.fuel_types?.unit ?? 'L')}
                  </Td>
                  <Td className="tabular text-right text-neutral-600">
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
                  form={<EditSlipForm slip={r} shiftName={r.shifts?.name ?? null} />}
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
