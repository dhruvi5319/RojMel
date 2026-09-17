import { formatDate, money, quantity } from '@/lib/format'
import { rupeesInWords } from '@/lib/words'
import type { Station } from '@/lib/database.types'
import type { Bill } from './bill'
import { Badge, TableWrap, Td, Th } from '@/components/ui'
import { STATUS_TONE } from '../page'

/**
 * The bill itself, and the only thing in this app a customer ever sees. Shared
 * by the screen and the printable page so paper and glass can never disagree.
 */
export function BillDocument({
  bill,
  station,
  t,
}: {
  bill: Bill
  station: Station
  t: (k: 'inv.document' | 'inv.billedTo' | 'inv.period' | 'inv.subtotal' |
        'inv.tax' | 'inv.roundOff' | 'common.total' | 'nav.payments' |
        'cust.balance' | 'common.date' | 'inv.dueDate' | 'common.fuel' |
        'credit.vehicle' | 'common.quantity' | 'common.rate' | 'common.amount' |
        `inv.${'draft' | 'issued' | 'partly_paid' | 'paid' | 'cancelled'}` |
        'pay.title' | 'inv.amountInWords' | 'inv.signedFor') => string
}) {
  const { invoice, customer, slips, payments, paid, due } = bill

  return (
    <div className="print-plain rounded-[var(--radius-card)] bg-surface p-6 sm:p-8">
      {/* ---------------------------------------------------------- header -- */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-divider pb-6">
        <div>
          <h2 className="text-[21px]">{station.legal_name || station.name}</h2>
          {station.address ? (
            <p className="mt-1 max-w-xs text-[13px] text-neutral-600">
              {station.address}
            </p>
          ) : null}
          <p className="mt-0.5 text-[13px] text-neutral-600">
            {[station.city, station.state, station.pincode].filter(Boolean).join(', ')}
          </p>
          {station.gstin ? (
            <p className="mt-1 text-[13px]">
              <span className="text-neutral-600">GSTIN: </span>
              <span className="tabular">{station.gstin}</span>
            </p>
          ) : null}
          {station.phone ? (
            <p className="tabular text-[13px] text-neutral-600">{station.phone}</p>
          ) : null}
        </div>

        <div className="text-right">
          <div className="text-[11px] font-semibold tracking-[0.08em] text-neutral-600 uppercase">
            {t('inv.document')}
          </div>
          <div className="tabular mt-1 text-[19px] font-semibold">
            {invoice.invoice_number}
          </div>
          <div className="mt-2 text-[13px]">
            <span className="text-neutral-600">{t('common.date')}: </span>
            {formatDate(invoice.issue_date)}
          </div>
          {invoice.due_date ? (
            <div className="text-[13px]">
              <span className="text-neutral-600">{t('inv.dueDate')}: </span>
              {formatDate(invoice.due_date)}
            </div>
          ) : null}
          <div className="mt-2">
            <Badge tone={STATUS_TONE[invoice.status]}>{t(`inv.${invoice.status}`)}</Badge>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- billed -- */}
      <div className="py-6">
        <div className="text-[11px] font-semibold tracking-[0.08em] text-neutral-600 uppercase">
          {t('inv.billedTo')}
        </div>
        <div className="mt-1 text-[17px] font-semibold">{customer?.name}</div>
        {customer?.address ? (
          <p className="mt-0.5 max-w-sm text-[13px] text-neutral-600">
            {customer.address}
          </p>
        ) : null}
        {customer?.gstin ? (
          <p className="text-[13px]">
            <span className="text-neutral-600">GSTIN: </span>
            <span className="tabular">{customer.gstin}</span>
          </p>
        ) : null}
        <p className="text-[13px] text-neutral-600">
          {t('inv.period')}: {formatDate(invoice.period_from)} –{' '}
          {formatDate(invoice.period_to)}
        </p>
      </div>

      {/* ----------------------------------------------------------- slips -- */}
      <div className="rounded-[18px] border border-divider">
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('common.date')}</Th>
              <Th>{t('credit.vehicle')}</Th>
              <Th>{t('common.fuel')}</Th>
              <Th className="text-right">{t('common.quantity')}</Th>
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
                      className={`text-[12.5px] text-neutral-600${s.vehicle_number ? ' ml-2' : ''}`}
                    >
                      #{s.slip_number}
                    </span>
                  ) : null}
                  {!s.vehicle_number && !s.slip_number ? '—' : null}
                </Td>
                <Td>{s.fuel_types?.name ?? '—'}</Td>
                <Td className="tabular text-right">
                  {quantity(s.quantity, s.fuel_types?.unit ?? 'L')}
                </Td>
                <Td className="tabular text-right">{Number(s.sale_rate).toFixed(2)}</Td>
                <Td className="tabular text-right font-medium">{money(s.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>

      {/* ---------------------------------------------------------- totals -- */}
      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs text-[14px]">
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
          <div className="mt-2 flex justify-between border-t border-divider pt-3 text-[17px] font-semibold">
            <dt>{t('common.total')}</dt>
            <dd className="tabular">{money(invoice.total)}</dd>
          </div>
          {paid > 0 ? (
            <>
              <div className="mt-2">
                <Line label={t('nav.payments')} value={`− ${money(paid)}`} />
              </div>
              <div className="flex justify-between border-t border-divider pt-2 font-semibold">
                <dt>{t('cust.balance')}</dt>
                <dd className="tabular">{money(due)}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>

      {/* A figure in words is harder to alter after the fact. */}
      <div className="mt-5 border-t border-divider pt-4">
        <div className="text-[11px] font-semibold tracking-[0.08em] text-neutral-600 uppercase">
          {t('inv.amountInWords')}
        </div>
        <div className="mt-1 text-[14px] font-medium">
          {rupeesInWords(invoice.total)}
        </div>
      </div>

      {payments.length > 0 ? (
        <div className="mt-5 border-t border-divider pt-4">
          <div className="mb-2 text-[12.5px] font-semibold text-neutral-600">
            {t('pay.title')}
          </div>
          <ul className="flex flex-col gap-1 text-[13px]">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-4">
                <span>
                  {formatDate(p.payment_date)} · {p.mode.replace('_', ' ')}
                  {p.reference ? ` · ${p.reference}` : ''}
                </span>
                <span className="tabular">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {invoice.notes ? (
        <p className="mt-5 border-t border-divider pt-4 text-[13px] text-neutral-600">
          {invoice.notes}
        </p>
      ) : null}

      {/* Somewhere to sign, as a paper bill needs. */}
      <div className="mt-10 flex justify-end">
        <div className="w-56 text-center">
          <div className="border-t border-divider pt-2 text-[12.5px] text-neutral-600">
            {t('inv.signedFor')} {station.legal_name || station.name}
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}
