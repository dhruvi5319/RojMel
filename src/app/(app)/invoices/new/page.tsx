import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { monthEnd, monthStart, todayIST } from '@/lib/format'
import type { CustomerBalance } from '@/lib/database.types'
import { Card, LinkButton, PageHeader } from '@/components/ui'
import { GenerateInvoiceForm } from './GenerateInvoiceForm'

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

  const { data } = await supabase
    .from('v_customer_balances')
    .select('*')
    .eq('is_active', true)
    .order('unbilled_amount', { ascending: false })

  // Default to last month, which is when a monthly bill is normally raised.
  const today = todayIST()
  const lastMonth = `${today.slice(0, 8)}01`
  const prev = new Date(`${lastMonth}T12:00:00Z`)
  prev.setUTCMonth(prev.getUTCMonth() - 1)
  const prevIso = prev.toISOString().slice(0, 10)

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
      <Card className="p-5">
        <GenerateInvoiceForm
          customers={(data ?? []) as CustomerBalance[]}
          preselected={preselected}
          defaultFrom={monthStart(prevIso)}
          defaultTo={monthEnd(prevIso)}
        />
      </Card>
    </>
  )
}
