import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import type { CreditSale, Customer, Payment } from '@/lib/database.types'

/** One CSV cell, quoted so a comma in a name cannot shift the columns. */
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const row = (cells: unknown[]) => cells.map(cell).join(',')

/**
 * A customer's account history as a file.
 *
 * This is the one thing an accountant actually asks for, and until now the app
 * could only show it on a screen. Same running balance as the ledger on the
 * customer page, so the two can never disagree.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return new Response('Not signed in', { status: 401 })
  if (session.profile.role === 'counter') {
    return new Response('Not allowed', { status: 403 })
  }

  const { id } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle<Customer>()

  if (!customer) return new Response('No such customer', { status: 404 })

  const [slipsRes, paymentsRes] = await Promise.all([
    supabase
      .from('credit_sales')
      .select('*, fuel_types(name, unit)')
      .eq('customer_id', id)
      .order('business_date'),
    supabase
      .from('payments')
      .select('*')
      .eq('customer_id', id)
      .order('payment_date'),
  ])

  type Slip = CreditSale & { fuel_types: { name: string; unit: string } | null }

  const entries = [
    ...((slipsRes.data ?? []) as unknown as Slip[]).map((s) => ({
      date: s.business_date,
      what: 'Udhaar slip',
      detail: [s.vehicle_number, s.slip_number && `#${s.slip_number}`, s.fuel_types?.name]
        .filter(Boolean)
        .join(' · '),
      qty: `${s.quantity} ${s.fuel_types?.unit ?? 'L'}`,
      rate: s.sale_rate,
      taken: Number(s.amount),
      paid: 0,
    })),
    ...((paymentsRes.data ?? []) as Payment[]).map((p) => ({
      date: p.payment_date,
      what: 'Money received',
      detail: [p.mode.replace('_', ' '), p.reference].filter(Boolean).join(' · '),
      qty: '',
      rate: '',
      taken: 0,
      paid: Number(p.amount),
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const lines: string[] = [
    row([session.station.legal_name || session.station.name]),
    row(['Account history', customer.name]),
    row(['Owed when you started', customer.opening_balance]),
    '',
    row(['Date', 'What', 'Details', 'Quantity', 'Rate', 'Taken on udhaar', 'Money received', 'Still owed']),
  ]

  let running = Number(customer.opening_balance)
  for (const e of entries) {
    running = running + e.taken - e.paid
    lines.push(
      row([
        formatDate(e.date),
        e.what,
        e.detail,
        e.qty,
        e.rate,
        e.taken || '',
        e.paid || '',
        running.toFixed(2),
      ]),
    )
  }
  lines.push('')
  lines.push(row(['', '', '', '', '', '', 'Still owed', running.toFixed(2)]))

  const safeName = customer.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
  const filename = `${safeName}-account-${new Date().toISOString().slice(0, 10)}.csv`

  // A BOM so Excel opens the rupee figures and Gujarati names correctly.
  return new Response('﻿' + lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
}
