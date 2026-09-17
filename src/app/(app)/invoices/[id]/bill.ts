import { createClient } from '@/lib/supabase/server'
import type {
  CreditSale, Customer, Invoice, Payment,
} from '@/lib/database.types'

export interface BillSlip extends CreditSale {
  fuel_types: { name: string; unit: 'L' | 'kg' } | null
}

export interface Bill {
  invoice: Invoice
  customer: Customer | null
  slips: BillSlip[]
  payments: Payment[]
  paid: number
  due: number
}

/** Everything the bill document needs, for the screen and for paper alike. */
export async function loadBill(id: string): Promise<Bill | null> {
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle<Invoice>()

  if (!invoice) return null

  const [customerRes, slipsRes, paymentsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('id', invoice.customer_id)
      .maybeSingle<Customer>(),
    supabase
      .from('credit_sales')
      .select('*, fuel_types(name, unit)')
      .eq('invoice_id', id)
      .order('business_date'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('payment_date'),
  ])

  const payments = (paymentsRes.data ?? []) as Payment[]
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0)

  return {
    invoice,
    customer: customerRes.data,
    slips: (slipsRes.data ?? []) as unknown as BillSlip[],
    payments,
    paid,
    due: Number(invoice.total) - paid,
  }
}
