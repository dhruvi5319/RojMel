
import { notFound } from 'next/navigation'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, litres, money } from '@/lib/format'
import type {
  CreditSale, Customer, Invoice, Payment,
} from '@/lib/database.types'
import {
  Alert, Badge, Card, LinkButton, PageHeader, TableWrap, Td, Th,
} from '@/components/ui'
import { PrintButton } from '@/components/PrintButton'
import { STATUS_TONE } from '../page'
import { CancelInvoice } from './CancelInvoice'

export const dynamic = 'force-dynamic'

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { station } = await requireBackOffice()
  const { id } = await params
  const t = await getT()
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle<Invoice>()

  if (!invoice) notFound()

  const [customerRes, slipsRes, paymentsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('id', invoice.customer_id)
      .maybeSingle<Customer>(),
    supabase
      .from('credit_sales')
      .select('*, fuel_types(name), vehicles(vehicle_number)')
      .eq('invoice_id', id)
      .order('business_date'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('payment_date'),
  ])

  const customer = customerRes.data
  const slips = (slipsRes.data ?? []) as unknown as (CreditSale & {
    fuel_types: { name: string } | null
  })[]
  const payments = (paymentsRes.data ?? []) as Payment[]
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const due = Number(invoice.total) - paid

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={invoice.invoice_number}
          subtitle={`${formatDate(invoice.period_from)} – ${formatDate(invoice.period_to)}`}
          action={
            <>
              <LinkButton href="/invoices" variant="secondary" size="sm">
                {t('common.back')}
              </LinkButton>
              <PrintButton />
              <LinkButton
                href={`/payments/new?customer=${invoice.customer_id}&invoice=${id}`}
                size="sm"
              >
                {t('pay.new')}
              </LinkButton>
            </>
          }
        />
      </div>

      <Card className="print-plain p-6 sm:p-8">
        {/* ------------------------------------------------------ header -- */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <h2 className="text-xl font-semibold">{station.legal_name || station.name}</h2>
            {station.address ? (
              <p className="mt-1 max-w-xs text-sm text-muted">{station.address}</p>
            ) : null}
            <p className="mt-1 text-sm text-muted">
              {[station.city, station.state, station.pincode].filter(Boolean).join(', ')}
            </p>
            {station.gstin ? (
              <p className="mt-1 text-sm">
                <span className="text-muted">GSTIN: </span>
                <span className="tabular">{station.gstin}</span>
              </p>
            ) : null}
            {station.phone ? (
              <p className="text-sm tabular text-muted">{station.phone}</p>
            ) : null}
          </div>

          <div className="text-right">
            <div className="text-sm font-semibold tracking-wide text-muted uppercase">
              {t('inv.document')}
            </div>
            <div className="tabular mt-1 text-lg font-semibold">
              {invoice.invoice_number}
            </div>
            <div className="mt-2 text-sm">
              <span className="text-muted">{t('common.date')}: </span>
              {formatDate(invoice.issue_date)}
            </div>
            {invoice.due_date ? (
              <div className="text-sm">
                <span className="text-muted">{t('inv.dueDate')}: </span>
                {formatDate(invoice.due_date)}
              </div>
            ) : null}
            <div className="mt-2">
              <Badge tone={STATUS_TONE[invoice.status]}>{t(`inv.${invoice.status}`)}</Badge>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- billed -- */}
        <div className="py-6">
          <div className="text-sm font-semibold tracking-wide text-muted uppercase">
            {t('inv.billedTo')}
          </div>
          <div className="mt-1 text-lg font-semibold">{customer?.name}</div>
          {customer?.address ? (
            <p className="mt-0.5 max-w-sm text-sm text-muted">{customer.address}</p>
          ) : null}
          {customer?.gstin ? (
            <p className="text-sm">
              <span className="text-muted">GSTIN: </span>
              <span className="tabular">{customer.gstin}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted">
            {t('inv.period')}: {formatDate(invoice.period_from)} –{' '}
            {formatDate(invoice.period_to)}
          </p>
        </div>

        {/* -------------------------------------------------------- slips -- */}
        <div className="rounded-lg border border-border">
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.date')}</Th>
                <Th>{t('credit.vehicle')}</Th>
                <Th>{t('common.fuel')}</Th>
                <Th className="text-right">{t('common.litres')}</Th>
                <Th className="text-right">{t('common.rate')}</Th>
                <Th className="text-right">{t('common.amount')}</Th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap">{formatDate(s.business_date)}</Td>
                  <Td className="tabular">
                    {s.vehicle_number ? <span>{s.vehicle_number}</span> : null}
                    {s.slip_number ? (
                      <span
                        className={`text-sm text-muted${s.vehicle_number ? ' ml-2' : ''}`}
                      >
                        #{s.slip_number}
                      </span>
                    ) : null}
                    {!s.vehicle_number && !s.slip_number ? '—' : null}
                  </Td>
                  <Td>{s.fuel_types?.name ?? '—'}</Td>
                  <Td className="tabular text-right">{litres(s.litres)}</Td>
                  <Td className="tabular text-right">
                    {Number(s.sale_rate).toFixed(2)}
                  </Td>
                  <Td className="tabular text-right font-medium">{money(s.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>

        {/* ------------------------------------------------------- totals -- */}
        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs text-[15px]">
            <Line label={t('inv.subtotal')} value={money(invoice.subtotal)} />
            {Number(invoice.tax_rate) > 0 ? (
              <Line
                label={`${t('inv.tax')} (${invoice.tax_rate}%)`}
                value={money(invoice.tax_amount)}
              />
            ) : null}
            {Number(invoice.round_off) !== 0 ? (
              <Line label={t('inv.roundOff')} value={money(invoice.round_off)} />
            ) : null}
            <div className="mt-2 flex justify-between border-t border-border pt-3 text-lg font-semibold">
              <dt>{t('common.total')}</dt>
              <dd className="tabular">{money(invoice.total)}</dd>
            </div>
            {paid > 0 ? (
              <>
                <div className="mt-2">
                  <Line label={t('nav.payments')} value={`− ${money(paid)}`} />
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <dt>{t('cust.balance')}</dt>
                  <dd className="tabular">{money(due)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        {payments.length > 0 ? (
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2 text-sm font-semibold text-muted">
              {t('pay.title')}
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-4">
                  <span>
                    {formatDate(p.payment_date)} · {t(`mode.${p.mode}`)}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span className="tabular">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {invoice.notes ? (
          <p className="mt-6 border-t border-border pt-4 text-sm text-muted">
            {invoice.notes}
          </p>
        ) : null}
      </Card>

      {invoice.status !== 'cancelled' ? (
        <div className="no-print mt-4">
          <CancelInvoice id={id} />
        </div>
      ) : (
        <div className="no-print mt-4">
          <Alert tone="accent">{t('inv.cancelled')}</Alert>
        </div>
      )}
    </>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}
