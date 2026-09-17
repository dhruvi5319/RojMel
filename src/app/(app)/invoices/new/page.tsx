import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import type { CustomerBalance } from '@/lib/database.types'
import { Alert, Card, LinkButton, PageHeader } from '@/components/ui'
import { GenerateInvoiceForm, type UnbilledSlip } from './GenerateInvoiceForm'

export const dynamic = 'force-dynamic'

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()
  const preselected = (await searchParams).customer ?? ''

  const [customersRes, slipsRes] = await Promise.all([
    supabase
      .from('v_customer_balances')
      .select('*')
      .eq('is_active', true)
      .order('unbilled_amount', { ascending: false }),
    // Only what is not yet on a bill, so the form can total any date range
    // without another round trip. Unbilled slips are by nature a short list.
    supabase
      .from('credit_sales')
      .select('customer_id, business_date, amount')
      .is('invoice_id', null)
      .order('business_date'),
  ])

  const customers = (customersRes.data ?? []) as CustomerBalance[]
  const unbilled = (slipsRes.data ?? []) as UnbilledSlip[]

  return (
    <>
      <PageHeader
        title={t('inv.new')}
        action={
          <LinkButton href="/invoices" variant="secondary" size="sm">
            {t('common.back')}
          </LinkButton>
        }
      />

      {unbilled.length === 0 ? (
        <Alert tone="ok">{t('inv.nothingToBill')}</Alert>
      ) : (
        <Card className="p-5">
          <GenerateInvoiceForm
            customers={customers.filter((c) => c.unbilled_amount > 0)}
            unbilled={unbilled}
            preselected={preselected}
          />
        </Card>
      )}
    </>
  )
}
