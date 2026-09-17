import { notFound } from 'next/navigation'
import { requireBackOffice } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { formatDate } from '@/lib/format'
import { Alert, LinkButton, PageHeader } from '@/components/ui'
import { BillDocument } from './BillDocument'
import { CancelInvoice } from './CancelInvoice'
import { loadBill } from './bill'

export const dynamic = 'force-dynamic'

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { station } = await requireBackOffice()
  const { id } = await params
  const t = await getT()

  const bill = await loadBill(id)
  if (!bill) notFound()

  return (
    <>
      <PageHeader
        title={bill.invoice.invoice_number}
        subtitle={`${formatDate(bill.invoice.period_from)} – ${formatDate(bill.invoice.period_to)}`}
        action={
          <>
            <LinkButton href="/invoices" variant="secondary" size="sm">
              {t('common.back')}
            </LinkButton>
            {/* A separate page with nothing but the bill on it, so printing or
                saving a PDF gives the customer the bill and not the app. */}
            <LinkButton href={`/invoices/${id}/print`} target="_blank" size="sm">
              {t('inv.download')}
            </LinkButton>
            <LinkButton
              href={`/payments/new?customer=${bill.invoice.customer_id}&invoice=${id}`}
              variant="secondary"
              size="sm"
            >
              {t('pay.new')}
            </LinkButton>
          </>
        }
      />

      <p className="mb-4 text-[12.5px] text-neutral-600">{t('inv.downloadHint')}</p>

      <BillDocument bill={bill} station={station} t={t} />

      {bill.invoice.status !== 'cancelled' ? (
        <div className="mt-4">
          <CancelInvoice id={id} />
        </div>
      ) : (
        <div className="mt-4">
          <Alert tone="accent">{t('inv.cancelled')}</Alert>
        </div>
      )}
    </>
  )
}
