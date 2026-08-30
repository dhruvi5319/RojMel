import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { todayIST } from '@/lib/format'
import type { CustomerBalance, Invoice } from '@/lib/database.types'
import { Card, LinkButton, PageHeader } from '@/components/ui'
import { PaymentForm } from './PaymentForm'

export const dynamic = 'force-dynamic'

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; invoice?: string }>
}) {
  await requireBackOffice()
  const sp = await searchParams
  const t = await getT()
  const supabase = await createClient()

  const [customersRes, invoicesRes] = await Promise.all([
    supabase
      .from('v_customer_balances')
      .select('*')
      .eq('is_active', true)
      .order('balance', { ascending: false }),
    supabase
      .from('invoices')
      .select('*, payments(amount)')
      .in('status', ['issued', 'partly_paid'])
      .order('issue_date', { ascending: false }),
  ])

  const invoices = (invoicesRes.data ?? []) as unknown as (Invoice & {
    payments: { amount: number }[]
  })[]

  return (
    <>
      <PageHeader
        title={t('pay.new')}
        action={
          <LinkButton href="/payments" variant="secondary" size="sm">
            {t('common.back')}
          </LinkButton>
        }
      />
      <Card className="p-5">
        <PaymentForm
          today={todayIST()}
          customers={(customersRes.data ?? []) as CustomerBalance[]}
          invoices={invoices.map((i) => ({
            id: i.id,
            customer_id: i.customer_id,
            invoice_number: i.invoice_number,
            due: Number(i.total) - i.payments.reduce((s, p) => s + Number(p.amount), 0),
          }))}
          preselectedCustomer={sp.customer ?? ''}
          preselectedInvoice={sp.invoice ?? ''}
        />
      </Card>
    </>
  )
}
