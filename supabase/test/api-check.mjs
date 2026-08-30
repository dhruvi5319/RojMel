/**
 * Exercises every query the app actually makes, through PostgREST with real
 * user sessions. psql proves the schema; this proves the API surface — the
 * embedded joins, the views, and the RPC signatures the pages depend on.
 *
 *   node supabase/test/api-check.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PASSWORD = 'pumpbook123'

let failures = 0
const ok = (label, extra = '') => console.log(`ok    ${label}${extra ? `  ${extra}` : ''}`)
const fail = (label, detail) => {
  failures++
  console.log(`FAIL  ${label}\n      ${detail}`)
}

/** assert(condition) — reports `label` either way and keeps the count. */
function assert(condition, label, detail = '', extra = '') {
  if (condition) ok(label, extra)
  else fail(label, detail)
}

function check(label, { data, error }, assert) {
  if (error) return fail(label, error.message)
  if (assert) {
    const problem = assert(data)
    if (problem) return fail(label, problem)
  }
  ok(label, Array.isArray(data) ? `${data.length} rows` : '')
  return data
}

async function signIn(email) {
  const supabase = createClient(URL, KEY)
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign in ${email}: ${error.message}`)
  return supabase
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/**
 * Clear anything a previous run left behind, so the suite can be run over and
 * over against the same stack. Order follows the foreign keys.
 */
async function resetToday() {
  const owner = await signIn('father@test.in')

  // A day approved by an earlier run would lock every delete below.
  await owner.rpc('reopen_day', { p_date: today, p_reason: 'test reset' })

  const wipe = async (table, column, value) => {
    const { error } = await owner.from(table).delete().eq(column, value)
    if (error) fail(`reset ${table}`, error.message)
  }

  const { data: shifts } = await owner.from('shifts').select('id').eq('business_date', today)
  const shiftIds = (shifts ?? []).map((s) => s.id)

  await owner.from('payments').delete().eq('payment_date', today)
  await wipe('credit_sales', 'business_date', today)
  await owner.from('invoices').delete().eq('issue_date', today)
  if (shiftIds.length) {
    await owner.from('nozzle_readings').delete().in('shift_id', shiftIds)
    await owner.from('shift_collections').delete().in('shift_id', shiftIds)
  }
  await wipe('shifts', 'business_date', today)
  await wipe('expenses', 'business_date', today)
  await wipe('bank_deposits', 'deposit_date', today)
  await owner.from('staff_payments').delete().eq('payment_date', today)
  await wipe('day_closings', 'business_date', today)

  const { data: purchases } = await owner
    .from('fuel_purchases').select('id').eq('delivery_date', today)
  for (const p of purchases ?? []) {
    await owner.from('fuel_purchase_costs').delete().eq('purchase_id', p.id)
  }
  await wipe('fuel_purchases', 'delivery_date', today)

  // Fixtures this suite creates, identified by the names it uses.
  const { data: stale } = await owner
    .from('customers').select('id').like('name', 'Shree Transport %')
  for (const c of stale ?? []) {
    await owner.from('vehicles').delete().eq('customer_id', c.id)
    await owner.from('payments').delete().eq('customer_id', c.id)
    await owner.from('credit_sales').delete().eq('customer_id', c.id)
    await owner.from('invoices').delete().eq('customer_id', c.id)
    await owner.from('customers').delete().eq('id', c.id)
  }
  await owner.from('staff').delete().eq('name', 'Ramesh')
}

await resetToday()

/* ----------------------------------------------------------- as manager -- */
const mgr = await signIn('manager@test.in')
console.log('\n--- manager ---')

check('profiles: own row', await mgr.from('profiles').select('*').limit(5), (d) =>
  d.length === 0 ? 'expected to see the pump’s people' : null)

// Compare against what is actually configured rather than a fixed number, so
// adding a nozzle to the pump does not break the suite.
const activeNozzles = (await mgr.from('nozzles').select('id').eq('is_active', true)).data.length
const activeTanks = (await mgr.from('tanks').select('id').eq('is_active', true)).data.length

check('v_nozzle_state (shift form)', await mgr.from('v_nozzle_state').select('*'), (d) =>
  d.length !== activeNozzles ? `expected ${activeNozzles} nozzles, got ${d.length}` : null)

check('v_tank_stock', await mgr.from('v_tank_stock').select('*'), (d) =>
  d.length !== activeTanks ? `expected ${activeTanks} tanks, got ${d.length}` : null)

check('rpc day_summary', await mgr.rpc('day_summary', { p_date: today }), (d) =>
  d && typeof d.meter_sales !== 'undefined' ? null : 'no meter_sales in payload')

check('rpc cash_position', await mgr.rpc('cash_position'), (d) =>
  d && typeof d.in_hand !== 'undefined' ? null : 'no in_hand in payload')

check('rpc sales_by_day', await mgr.rpc('sales_by_day', { p_from: today, p_to: today }))
check('rpc sales_by_fuel', await mgr.rpc('sales_by_fuel', { p_from: today, p_to: today }))

// Margin must be refused for the manager, in the API as well as in psql.
{
  const { error } = await mgr.rpc('margin_report', { p_from: today, p_to: today })
  assert(error, 'rpc margin_report refused for manager', 'manager was allowed to see margin')
}
{
  const { data } = await mgr.from('fuel_purchase_costs').select('*')
  assert(data?.length === 0, 'fuel_purchase_costs hidden from manager', `manager saw ${data?.length} cost rows`)
}

/* --------------------------------------------- write a day of trading --- */
console.log('\n--- writing a day ---')

const customer = check(
  'insert customer',
  await mgr.from('customers').insert({
    name: `Shree Transport ${Date.now()}`,
    opening_balance: 50000,
    credit_limit: 200000,
  }).select().single(),
)

check(
  'insert vehicle',
  await mgr.from('vehicles').insert({
    customer_id: customer.id,
    vehicle_number: `GJ01AB${String(Date.now()).slice(-4)}`,
    driver_name: 'Suresh',
  }).select().single(),
)

const staff = check(
  'insert staff',
  await mgr.from('staff').insert({ name: 'Ramesh', name_gu: 'રમેશ', monthly_salary: 14000 })
    .select().single(),
)

const shift = check(
  'insert shift',
  await mgr.from('shifts').insert({ business_date: today, name: 'Morning', sort_order: 1 })
    .select().single(),
)

const nozzles = (await mgr.from('v_nozzle_state').select('*').order('sort_order')).data
const p1 = nozzles.find((n) => n.name === 'P1')
const d1 = nozzles.find((n) => n.name === 'D1')

const readings = check(
  'upsert nozzle readings',
  await mgr.from('nozzle_readings').upsert(
    [
      { shift_id: shift.id, nozzle_id: p1.nozzle_id, staff_id: staff.id,
        opening_reading: 1000, closing_reading: 1200, test_litres: 2, sale_rate: 96.5 },
      { shift_id: shift.id, nozzle_id: d1.nozzle_id, staff_id: staff.id,
        opening_reading: 5000, closing_reading: 5500, test_litres: 0, sale_rate: 89.2 },
    ],
    { onConflict: 'shift_id,nozzle_id' },
  ).select(),
  (d) => {
    const total = d.reduce((s, r) => s + Number(r.amount), 0)
    return Math.abs(total - 63707) > 0.01 ? `expected 63707.00, got ${total}` : null
  },
)
ok('  generated litres/amount', `${readings.reduce((s, r) => s + Number(r.litres), 0)} L`)

check(
  'insert credit slip',
  await mgr.from('credit_sales').insert({
    business_date: today, shift_id: shift.id, customer_id: customer.id,
    fuel_type_id: d1.fuel_type_id, nozzle_id: d1.nozzle_id, staff_id: staff.id,
    litres: 300, sale_rate: 89.2, slip_number: 'S-001',
  }).select().single(),
  (d) => (Math.abs(Number(d.amount) - 26760) > 0.01 ? `expected 26760, got ${d.amount}` : null),
)

check(
  'upsert handover',
  await mgr.from('shift_collections').upsert(
    { shift_id: shift.id, staff_id: staff.id, cash_amount: 30000, upi_amount: 6947 },
    { onConflict: 'shift_id,staff_id' },
  ).select(),
)

check('insert expense',
  await mgr.from('expenses').insert({ business_date: today, category: 'Repairs', amount: 500, mode: 'cash' }).select())
check('insert payment',
  await mgr.from('payments').insert({ customer_id: customer.id, payment_date: today, amount: 20000, mode: 'cash' }).select())
check('insert bank deposit',
  await mgr.from('bank_deposits').insert({ deposit_date: today, bank_name: 'Bank of Baroda', amount: 40000, slip_reference: 'SLIP-77' }).select())

/* ------------------------------------------------- the figures add up --- */
console.log('\n--- the figures ---')

const summary = check('day_summary after trading',
  await mgr.rpc('day_summary', { p_date: today }))
const expect = (label, actual, wanted) =>
  assert(Math.abs(Number(actual) - wanted) < 0.01, label, String(actual), `expected ${wanted}, got ${actual}`)

expect('  meter sales', summary.meter_sales, 63707)
expect('  credit sales', summary.credit_sales, 26760)
expect('  counter sales', summary.counter_sales, 36947)
expect('  collections tally', summary.collection_short, 0)
expect('  cash expected', summary.expected_cash, 9500)

const balances = check('v_customer_balances',
  await mgr.from('v_customer_balances').select('*').eq('customer_id', customer.id).single())
expect('  customer balance', balances.balance, 56760)
expect('  unbilled', balances.unbilled_amount, 26760)

const stock = check('v_tank_stock after sales', await mgr.from('v_tank_stock').select('*'))
// Tanks were created with zero opening stock, so selling from them goes
// negative — the arithmetic is what is under test, not the sign.
const opening = Object.fromEntries(
  (await mgr.from('tanks').select('name, opening_stock_litres')).data
    .map((t) => [t.name, Number(t.opening_stock_litres)]))
expect('  petrol stock', stock.find((t) => t.name === 'Tank 1 Petrol').book_stock_litres,
       opening['Tank 1 Petrol'] - 198)
expect('  diesel stock', stock.find((t) => t.name === 'Tank 2 Diesel').book_stock_litres,
       opening['Tank 2 Diesel'] - 500)

/* ---------------------------------------- embedded joins the pages use --- */
console.log('\n--- embedded selects ---')

check('credit list join', await mgr.from('credit_sales').select('*, customers(name), fuel_types(name)').eq('business_date', today))
check('payments list join', await mgr.from('payments').select('*, customers(name), invoices(invoice_number)'))
check('shifts list join', await mgr.from('shifts').select('*, nozzle_readings(litres, amount), shift_collections(cash_amount, upi_amount, card_amount)').eq('business_date', today))
check('bank list join', await mgr.from('bank_deposits').select('*, profiles!bank_deposits_deposited_by_fkey(full_name)'))
check('staff payments join', await mgr.from('staff_payments').select('*, staff(name)'))
check('stock deliveries join', await mgr.from('fuel_purchases').select('*, tanks(name), staff(name), fuel_purchase_costs(*)'))

// purchase_id is both PK and FK, so PostgREST embeds the cost as a single
// object. Reading it as an array silently hides every purchase rate.
{
  const owner2 = await signIn('father@test.in')
  const { data: tk } = await owner2.from('tanks').select('id, fuel_type_id').limit(1).single()
  const { data: pur } = await owner2.from('fuel_purchases').insert({
    tank_id: tk.id, fuel_type_id: tk.fuel_type_id, delivery_date: today,
    tanker_number: 'SHAPE-TEST', litres: 1000 }).select().single()
  await owner2.from('fuel_purchase_costs').insert({
    purchase_id: pur.id, rate_per_litre: 80, amount: 80000 })
  const { data: joined } = await owner2.from('fuel_purchases')
    .select('tanker_number, fuel_purchase_costs(amount)').eq('id', pur.id).single()
  assert(
    joined.fuel_purchase_costs && !Array.isArray(joined.fuel_purchase_costs)
      && Number(joined.fuel_purchase_costs.amount) === 80000,
    'purchase cost embeds as an object, not an array',
    `got ${JSON.stringify(joined.fuel_purchase_costs)}`)
  await owner2.from('fuel_purchase_costs').delete().eq('purchase_id', pur.id)
  await owner2.from('fuel_purchases').delete().eq('id', pur.id)
}
check('invoice slips join', await mgr.from('credit_sales').select('*, fuel_types(name), vehicles(vehicle_number)').limit(5))
check('settings nozzles join', await mgr.from('nozzles').select('*, tanks(name), fuel_types(name)'))
check('settings prices join', await mgr.from('fuel_prices').select('*, fuel_types(name)'))
check('day closing approver join', await mgr.from('day_closings').select('*, approver:profiles!day_closings_approved_by_fkey(full_name)'))

/* ------------------------------------------------------------ invoicing -- */
console.log('\n--- invoicing ---')

const invoiceId = check('rpc generate_invoice',
  await mgr.rpc('generate_invoice', {
    p_customer_id: customer.id, p_from: today, p_to: today, p_tax_rate: 0, p_due_days: 15,
  }))

const invoice = check('read the invoice', await mgr.from('invoices').select('*').eq('id', invoiceId).single())
expect('  invoice total', invoice.total, 26760)
ok('  invoice number', invoice.invoice_number)

check('pay the invoice',
  await mgr.from('payments').insert({
    customer_id: customer.id, invoice_id: invoiceId, payment_date: today,
    amount: 26760, mode: 'bank_transfer',
  }).select())

const settled = check('invoice status recomputed', await mgr.from('invoices').select('status').eq('id', invoiceId).single())
assert(settled.status === 'paid', '  marked paid', `expected paid, got ${settled.status}`)

/* --------------------------------------------------------- day approval -- */
console.log('\n--- day close ---')

check('rpc submit_day', await mgr.rpc('submit_day', { p_date: today, p_counted_cash: 9500, p_notes: 'All tallied' }))
{
  const { error } = await mgr.rpc('approve_day', { p_date: today, p_remarks: 'nope' })
  assert(error, 'approve_day refused for manager', 'manager approved her own day')
}

/* -------------------------------------------------------------- as owner -- */
const owner = await signIn('father@test.in')
console.log('\n--- owner ---')

const margin = check('rpc margin_report', await owner.rpc('margin_report', { p_from: today, p_to: today }))
ok('  sales value', String(margin.sales_value))
check('rpc approve_day', await owner.rpc('approve_day', { p_date: today, p_remarks: 'Checked with manager' }))

const approved = check('day is approved', await owner.from('day_closings').select('status').eq('business_date', today).single())
assert(approved.status === 'approved', '  approved', `got ${approved.status}`)

// The lock must hold through the API, not only in psql.
{
  const { error } = await mgr.from('expenses').insert({ business_date: today, category: 'late', amount: 100 })
  assert(error, 'approved day is locked to the manager', 'manager edited an approved day')
}
check('rpc reopen_day', await owner.rpc('reopen_day', { p_date: today, p_reason: 'missed a slip' }))
{
  const { error } = await mgr.from('expenses').insert({ business_date: today, category: 'after reopen', amount: 50 })
  assert(!error, 'manager can post again after reopen', error?.message ?? '')
}

/* ------------------------------------------------------------ as counter -- */
const counter = await signIn('counter@test.in')
console.log('\n--- counter device ---')

check('counter sees nozzles', await counter.from('v_nozzle_state').select('*'), (d) =>
  d.length !== activeNozzles ? `expected ${activeNozzles}, got ${d.length}` : null)
check('counter sees staff', await counter.from('staff').select('*'), (d) =>
  d.length === 0 ? 'expected the filler list' : null)
check('counter sees customers', await counter.from('customers').select('id, name'), (d) =>
  d.length === 0 ? 'expected the customer list' : null)

for (const table of ['expenses', 'bank_deposits', 'payments', 'invoices', 'fuel_purchase_costs', 'v_customer_balances']) {
  const { data } = await counter.from(table).select('*')
  assert(data?.length === 0, `counter sees no ${table}`, `saw ${data?.length} rows`)
}

check('counter writes a slip',
  await counter.from('credit_sales').insert({
    business_date: today, customer_id: customer.id,
    fuel_type_id: d1.fuel_type_id, litres: 50, sale_rate: 89.2, slip_number: 'S-002',
  }).select())
{
  const { error } = await counter.from('expenses').insert({ category: 'x', amount: 1 })
  assert(error, 'counter blocked from expenses', 'counter wrote an expense')
}

console.log(`\n${failures === 0 ? '================  API CHECK PASSED  ================' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
