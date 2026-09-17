import { notFound } from 'next/navigation'
import { requireBackOffice } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { BillDocument } from '@/app/(app)/invoices/[id]/BillDocument'
import { loadBill } from '@/app/(app)/invoices/[id]/bill'
import { AutoPrint } from './AutoPrint'

export const dynamic = 'force-dynamic'

export default async function BillPrintPage({
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
    <main className="mx-auto w-full max-w-[210mm] p-6 print:p-0">
      <AutoPrint />
      <BillDocument bill={bill} station={station} t={t} />
    </main>
  )
}
