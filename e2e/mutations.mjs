/**
 * Exercises every create / edit / delete the app offers, through the real UI,
 * and checks the change shows WITHOUT a reload and still there AFTER one.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const STAMP = String(Date.now()).slice(-6)
let pass = 0
const failures = []
const pageErrors = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
ctx.setDefaultNavigationTimeout(60000)
ctx.setDefaultTimeout(45000)
const page = await ctx.newPage()
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)))
page.on('response', (r) => {
  if (r.status() >= 500) pageErrors.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`)
})

async function check(label, fn) {
  try {
    await fn()
    pass++
    console.log(`ok    ${label}`)
  } catch (e) {
    failures.push(`${label}: ${e.message.split('\n')[0].slice(0, 160)}`)
    console.log(`FAIL  ${label}\n      ${e.message.split('\n')[0].slice(0, 160)}`)
  }
}

const body = () => page.locator('body').innerText()

/** Assert text is on the page now, and still there after a reload. */
async function reflects(needle) {
  const before = await body()
  if (!before.includes(needle)) {
    throw new Error(`"${needle}" did not appear without a reload`)
  }
  await page.reload()
  await page.waitForLoadState('load')
  await page.waitForTimeout(700)
  const after = await body()
  if (!after.includes(needle)) {
    throw new Error(`"${needle}" appeared but was GONE after reload (not saved)`)
  }
}

async function gone(needle) {
  await page.reload()
  await page.waitForLoadState('load')
  await page.waitForTimeout(700)
  if ((await body()).includes(needle)) throw new Error(`"${needle}" still present after delete`)
}

async function login(email) {
  await ctx.clearCookies()
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', 'pumpbook123')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
}

/** Pick the first <option> whose text contains `text`. */
async function selectContaining(selector, text) {
  const value = await page.locator(selector).evaluate(
    (el, t) => (Array.from(el.options).find((o) => o.text.includes(t)) || {}).value,
    text)
  if (value === undefined) throw new Error(`no option containing "${text}"`)
  await page.selectOption(selector, value)
}

/**
 * The pump's equipment is owner-only now, so these run signed in as the owner
 * and hand the session back to the manager afterwards.
 */
async function checkAsOwner(label, fn) {
  await login('father@test.in')
  await check(label, fn)
  await login('manager@test.in')
}

/** Open an EditableRow's pencil for the row containing `text`. */
async function openRowEditor(text) {
  const row = page.locator('tr', { hasText: text }).first()
  await row.locator('button[aria-label^="Edit"]').click()
  await page.waitForTimeout(400)
}

/** Open a Collapsible by its heading text. */
async function openPanel(title) {
  const btn = page.locator('button', { hasText: title }).first()
  const expanded = await btn.getAttribute('aria-expanded')
  if (expanded === 'false') await btn.click()
  await page.waitForTimeout(250)
}

async function submitIn(scope, waitMs = 2500) {
  await scope.locator('button[type=submit]').first().click()
  await page.waitForTimeout(waitMs)
}

/**
 * A previous run may have left today approved, which correctly locks every
 * write. Reopen it first so the suite starts from the same place each time.
 */
await login('father@test.in')
await page.goto(`${BASE}/day`)
if ((await body()).includes('Reopen day')) {
  const f = page.locator('form').filter({ has: page.locator('input[name=reason]') })
  await f.locator('input[name=reason]').fill('e2e reset')
  await f.locator('button[type=submit]').first().click()
  await page.waitForTimeout(2500)
  console.log('(reset) reopened today')
}

/* ======================================================= as the manager == */
await login('manager@test.in')
console.log('\n=== SETTINGS ===')
await page.goto(`${BASE}/settings`)

// Renaming the pump is owner-only. The manager must see read-only details
// rather than a form that silently does nothing.
await check('settings: manager cannot edit pump details', async () => {
  const editable = await page
    .locator('form').filter({ has: page.locator('input[name=invoice_prefix]') }).count()
  if (editable !== 0) throw new Error('the manager was shown an editable pump form')
  if (!(await body()).includes('Owner only')) throw new Error('no owner-only notice')
})

await checkAsOwner('settings: add a fuel, then remove it', async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'load' })
  await openPanel('Fuels')
  const form = page.locator('form')
    .filter({ has: page.locator('input[name=name_gu]') })
    .filter({ hasNot: page.locator('input[name=id]') })
  await form.locator('input[name=name]').fill(`Power ${STAMP}`)
  await form.locator('input[name=sale_rate]').fill('105.5')
  await submitIn(form)
  await reflects(`Power ${STAMP}`)

  // tidy up, so repeated runs do not fill the pump with invented fuels
  const row = page.locator('tr', { hasText: `Power ${STAMP}` }).first()
  await row.locator('button[aria-label^="Delete"]').click()
  await page.waitForTimeout(2500)
  await gone(`Power ${STAMP}`)
})

// Pump prices move daily, so the rate is a morning job on Today, not a
// settings job — and Settings must not grow a second way to set it.
await check('rates: set today\'s rate on Today', async () => {
  await page.goto(`${BASE}/rates`, { waitUntil: 'load' })
  await page.locator('button[aria-label^="Change rate"]').first().click()
  await page.waitForTimeout(400)
  const form = page.locator('form').filter({ has: page.locator('input[name=sale_rate]') })
  await form.locator('input[name=sale_rate]').fill('97.77')
  await submitIn(form)
  await reflects('₹97.77')

  // and it says who set it
  if (!(await body()).includes('Every rate change')) {
    throw new Error('no rate history on the Rates page')
  }
  await page.goto(`${BASE}/settings`, { waitUntil: 'load' })
  if ((await body()).includes('Change rate')) {
    throw new Error('Settings still offers a second way to set the rate')
  }
})

await checkAsOwner('settings: add a tank', async () => {
  await page.goto(`${BASE}/settings`)
  await openPanel('Tanks')
  const form = page.locator('form')
    .filter({ has: page.locator('input[name=capacity_litres]') })
    .filter({ hasNot: page.locator('input[name=id]') })
  await form.locator('input[name=name]').fill(`Tank ${STAMP}`)
  await form.locator('input[name=capacity_litres]').fill('12000')
  await submitIn(form)
  await reflects(`Tank ${STAMP}`)

  const row = page.locator('tr', { hasText: `Tank ${STAMP}` }).first()
  await row.locator('button[aria-label^="Delete"]').click()
  await page.waitForTimeout(2500)
  await gone(`Tank ${STAMP}`)
})

await checkAsOwner('settings: add a nozzle', async () => {
  await page.goto(`${BASE}/settings`)
  await openPanel('Nozzles')
  const form = page.locator('form')
    .filter({ has: page.locator('select[name=tank_id]') })
    .filter({ hasNot: page.locator('input[name=id]') })
  await form.locator('input[name=name]').fill(`N${STAMP}`)
  await submitIn(form)
  await reflects(`N${STAMP}`)

  const row = page.locator('tr', { hasText: `N${STAMP}` }).first()
  await row.locator('button[aria-label^="Delete"]').click()
  await page.waitForTimeout(2500)
  await gone(`N${STAMP}`)
})

console.log('\n=== STAFF ===')
await page.goto(`${BASE}/staff`)

await check('staff: add', async () => {
  await openPanel('Add staff')
  const form = page.locator('form').filter({ has: page.locator('input[name=monthly_salary]') })
    .filter({ has: page.locator('input[name=joined_on]') })
  await form.locator('input[name=name]').fill(`Filler ${STAMP}`)
  await form.locator('input[name=monthly_salary]').fill('15000')
  await submitIn(form)
  await reflects(`Filler ${STAMP}`)
})

await check('staff: edit salary', async () => {
  await page.goto(`${BASE}/staff`)
  const block = page.locator('details').filter({ hasText: `Filler ${STAMP}` })
  await block.locator('summary').click()
  await page.waitForTimeout(400)
  const form = block.locator('form')
  await form.locator('input[name=monthly_salary]').fill('21500')
  await submitIn(form)
  await reflects('₹21,500.00')
})

await check('staff: pay salary', async () => {
  await page.goto(`${BASE}/staff`)
  await openPanel('Pay staff')
  const form = page.locator('form').filter({ has: page.locator('select[name=staff_id]') })
  await selectContaining('select[name=staff_id]', `Filler ${STAMP}`)
  await form.locator('input[name=amount]').fill('7321')
  await submitIn(form)
  await reflects('₹7,321.00')
})

console.log('\n=== EXPENSES ===')
await check('expenses: add', async () => {
  await page.goto(`${BASE}/expenses`)
  await openPanel('Add expense')
  const form = page.locator('form').filter({ has: page.locator('input[name=category]') })
  await form.locator('input[name=category]').fill(`Repair ${STAMP}`)
  await form.locator('input[name=amount]').fill('1234')
  await submitIn(form)
  await reflects(`Repair ${STAMP}`)
})

await check('expenses: EDIT the amount', async () => {
  await page.goto(`${BASE}/expenses`)
  await openRowEditor(`Repair ${STAMP}`)
  const f = page.locator('td[colspan] form')
  await f.locator('input[name=amount]').fill('8765')
  await f.locator('input[name=paid_to]').fill(`Mechanic ${STAMP}`)
  await submitIn(f, 3000)
  await reflects('₹8,765.00')
  if (!(await body()).includes(`Mechanic ${STAMP}`)) throw new Error('paid-to did not update')
})

await check('expenses: delete', async () => {
  const row = page.locator('tr', { hasText: `Repair ${STAMP}` })
  await row.locator('button[type=submit]').click()
  await page.waitForTimeout(2500)
  await gone(`Repair ${STAMP}`)
})

console.log('\n=== BANK ===')
await check('bank: add deposit', async () => {
  await page.goto(`${BASE}/bank`)
  await openPanel('Record deposit')
  const form = page.locator('form').filter({ has: page.locator('input[name=bank_name]') })
  await form.locator('input[name=bank_name]').fill(`Bank ${STAMP}`)
  await form.locator('input[name=amount]').fill('4321')
  await submitIn(form)
  await reflects(`Bank ${STAMP}`)
})

await check('bank: EDIT the deposit', async () => {
  await page.goto(`${BASE}/bank`)
  await openRowEditor(`Bank ${STAMP}`)
  const f = page.locator('td[colspan] form')
  await f.locator('input[name=amount]').fill('9876')
  await f.locator('input[name=slip_reference]').fill(`SLIP${STAMP}`)
  await submitIn(f, 3000)
  await reflects('₹9,876.00')
  if (!(await body()).includes(`SLIP${STAMP}`)) throw new Error('slip reference did not update')
})

// A form that has saved must get out of the way. One still open with its
// fields full reads as "nothing happened", which is the one thing it must
// not say.
await check('a saved form closes itself', async () => {
  await page.goto(`${BASE}/expenses`)
  await openPanel('Add expense')
  const f = page.locator('form').filter({ has: page.locator('input[name=category]') })
  await f.locator('input[name=category]').fill(`Closes ${STAMP}`)
  await f.locator('input[name=amount]').fill('123')
  await submitIn(f, 2600)
  if ((await page.locator('form').filter({ has: page.locator('input[name=category]') }).count()) !== 0) {
    throw new Error('the add panel stayed open after saving')
  }
  await reflects(`Closes ${STAMP}`)

  // and so does a row editor, once the correction is in
  await openRowEditor(`Closes ${STAMP}`)
  const e = page.locator('td[colspan] form')
  await e.locator('input[name=amount]').fill('456')
  await submitIn(e, 2600)
  if ((await page.locator('td[colspan] form').count()) !== 0) {
    throw new Error('the row editor stayed open after saving')
  }
  await reflects('456')

  const row = page.locator('tr', { hasText: `Closes ${STAMP}` }).first()
  await row.locator('button[aria-label^="Delete"]').click()
  await page.waitForTimeout(2500)
})

console.log('\n=== STOCK ===')
// One trip from the depot, decanted into two of our tanks. The tanker is
// entered once; the compartments are never written down.
await check('stock: record a delivery, one tanker into two tanks', async () => {
  await page.goto(`${BASE}/stock`)
  await openPanel('Record delivery')
  const form = page.locator('form').filter({ has: page.locator('input[name=tanker_number]') })
  await form.locator('input[name=tanker_number]').fill(`GJ${STAMP}`)
  await form.locator('button', { hasText: 'Another tank' }).click()
  await page.waitForTimeout(300)

  const tanks = form.locator('select[name=line_tank_id]')
  if ((await tanks.count()) !== 2) throw new Error('a second tank line did not appear')
  const names = await tanks.first().locator('option').allTextContents()
  if (names.length < 2) throw new Error('only one tank configured; cannot test a split load')
  await tanks.nth(0).selectOption({ label: names[0] })
  await tanks.nth(1).selectOption({ label: names[1] })
  await form.locator('input[name=line_litres]').nth(0).fill('3210')
  await form.locator('input[name=line_litres]').nth(1).fill('1200')
  await submitIn(form)
  await reflects(`GJ${STAMP}`)

  const t2 = await body()
  if (!t2.includes('2 × tank')) throw new Error('the two tanks did not group under one tanker')
  if (!t2.includes('3,210.00 L') || !t2.includes('1,200.00 L')) {
    throw new Error('both loads should be listed under the tanker')
  }
  // The tanker is said once, not repeated on every tank it filled.
  if ((t2.match(new RegExp(`GJ${STAMP}`, 'g')) || []).length !== 1) {
    throw new Error('the tanker number is repeated per tank')
  }
})

await check('stock: record a dip', async () => {
  await page.goto(`${BASE}/stock`)
  await openPanel('Record dip')
  const form = page.locator('form').filter({ has: page.locator('input[name=dip_litres]') })
  await form.locator('input[name=dip_litres]').fill('4567')
  await submitIn(form)
  await reflects('4,567.00 L')
})

await check('stock: EDIT one tank off the delivery', async () => {
  await page.goto(`${BASE}/stock`)
  await openRowEditor('3,210.00 L')
  const f = page.locator('td[colspan] form')
  await f.locator('input[name=litres]').fill('4444')
  await submitIn(f, 3000)
  await reflects('4,444.00 L')
})

await check('cng: reachable from the Stock tab', async () => {
  await page.goto(`${BASE}/`)
  await page.locator('a', { hasText: /^Stock$/ }).first().click()
  await page.waitForLoadState('networkidle')
  const link = page.locator('a', { hasText: /^CNG$/ }).first()
  if ((await link.count()) === 0) throw new Error('no CNG behind the Stock door')
  await link.click()
  await page.waitForURL(/\/cng/, { timeout: 15000 })
  const t2 = await body()
  for (const w of ['KILOGRAMS SOLD', 'KILOGRAMS IN', 'Dispensers', 'CNG deliveries']) {
    if (!t2.includes(w)) throw new Error(`CNG page missing "${w}"`)
  }
  // It comes on a truck and is weighed in kilos; there is no inlet meter.
  if (/SCM/.test(t2)) throw new Error('the CNG page still talks about SCM')
})

// The manager runs the gas but never sees what it cost.
await check('cng: manager records a truck, without the cost', async () => {
  await page.goto(`${BASE}/cng`)
  await openPanel('Record a CNG delivery')
  const f = page.locator('form').filter({ has: page.locator('input[name=kg_received]') })
  if ((await f.locator('input[name=rate_per_kg]').count()) !== 0) {
    throw new Error('the manager was shown the gas rate')
  }
  await f.locator('input[name=tanker_number]').fill(`CNG${STAMP}`)
  await f.locator('input[name=invoice_kg]').fill('3300')
  await f.locator('input[name=kg_received]').fill('3210')
  await submitIn(f, 3000)
  await reflects('3210.000')
  // Both sides are kilograms, so a short delivery is arithmetic.
  if (!(await body()).includes('Less than the bill')) {
    throw new Error('90 kg short of the challan was not flagged')
  }
})

console.log('\n=== CUSTOMERS ===')
await check('customers: create', async () => {
  await page.goto(`${BASE}/customers/new`)
  await page.fill('input[name=name]', `Transport ${STAMP}`)
  await page.fill('input[name=credit_limit]', '500000')
  await page.click('button[type=submit]')
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}/, { timeout: 15000 })
  await reflects(`Transport ${STAMP}`)
})

await check('customers: add a vehicle', async () => {
  const form = page.locator('form').filter({ has: page.locator('input[name=vehicle_number]') })
  await form.locator('input[name=vehicle_number]').fill(`GJ01XX${STAMP.slice(-4)}`)
  await form.locator('input[name=driver_name]').fill('Suresh')
  await submitIn(form)
  await reflects(`GJ01XX${STAMP.slice(-4)}`)
})

await check('customers: edit details', async () => {
  const form = page.locator('form')
    .filter({ has: page.locator('input[name=credit_limit]') })
    .filter({ has: page.locator('input[name=id]') })
  await form.locator('input[name=name]').fill(`Transport ${STAMP} Pvt Ltd`)
  await form.locator('input[name=credit_limit]').fill('750000')
  await submitIn(form)
  await reflects(`Transport ${STAMP} Pvt Ltd`)
  if (!(await body()).includes('₹7,50,000.00')) throw new Error('credit limit did not update')
})

console.log('\n=== CREDIT SLIP ===')
await check('credit: write a slip', async () => {
  await page.goto(`${BASE}/credit/new`)
  await selectContaining('select[name=customer_id]', `Transport ${STAMP}`)
  await page.waitForTimeout(400)
  await selectContaining('select[name=fuel_type_id]', 'Diesel')
  await page.fill('input[name=quantity]', '111')
  await page.fill('input[name=slip_number]', `S${STAMP}`)
  await page.locator('form').locator('button[type=submit]').last().click()
  await page.waitForURL(/\/credit(\?|$)/, { timeout: 15000 })
  await reflects(`S${STAMP}`)
})

await check('credit: EDIT the slip quantity', async () => {
  await page.goto(`${BASE}/credit`)
  await openRowEditor(`S${STAMP}`)
  const f = page.locator('td[colspan] form')
  await f.locator('input[name=quantity]').fill('222')
  await f.locator('input[name=driver_name]').fill(`Driver ${STAMP}`)
  await submitIn(f, 3000)
  await reflects('222.00 L')
})

console.log('\n=== SHIFTS ===')
await check('shifts: open one', async () => {
  await page.goto(`${BASE}/shifts`)
  const t = await body()
  if (/Morning|Evening/.test(t)) throw new Error('the shift opener still offers three')
  if (!t.includes('Day shift')) {
    await page.locator('button', { hasText: 'Day shift' }).first().click()
    await page.waitForURL(/\/shifts\/[0-9a-f-]{36}/, { timeout: 15000 })
  }
})

await check('shifts: save meter readings', async () => {
  await page.goto(`${BASE}/shifts`)
  await page.locator('a', { hasText: 'Meter readings' }).first().click()
  await page.waitForURL(/\/shifts\/[0-9a-f-]{36}/, { timeout: 15000 })
  const cards = page.locator('input[type=number]')
  // first card: opening, closing, test, rate
  await cards.nth(1).fill('9999')
  await page.locator('button', { hasText: /^Save$/ }).first().click()
  await page.waitForTimeout(3000)
  await page.reload()
  await page.waitForLoadState('networkidle')
  const val = await page.locator('input[type=number]').nth(1).inputValue()
  if (Number(val) !== 9999) throw new Error(`closing reading did not persist, got "${val}"`)
})

await check('shifts: CNG in kilograms, and cash from a filler', async () => {
  await page.goto(`${BASE}/shifts`)
  await page.locator('a', { hasText: 'Meter readings' }).first().click()
  await page.waitForURL(/\/shifts\/[0-9a-f-]{36}/, { timeout: 15000 })

  const cng = page.locator('[aria-label="CNG readings"]')
  if ((await cng.count()) === 0) throw new Error('no CNG section on the shift screen')

  // the first dispenser: 5,000 -> 5,100 kg
  const nums = cng.locator('input[type=number]')
  await nums.nth(0).fill('5000')
  await nums.nth(1).fill('5100')
  await page.waitForTimeout(400)
  if (!(await body()).includes('100.00 kg')) throw new Error('kilograms not computed')

  // A filler hands over cash and nothing else; the rest is the money log's.
  const handover = page.locator('[aria-label="Handover"]')
  if ((await handover.locator('input[type=number]').count()) === 0) {
    throw new Error('no cash box for the filler')
  }
  const askedFor = await handover.locator('input[type=number]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('aria-label') ?? e.getAttribute('name') ?? ''))
  if (askedFor.some((l) => /UPI|BPCL|ATM/i.test(l))) {
    throw new Error(`a filler was asked for ${askedFor.join(', ')}`)
  }
  await handover.locator('input[type=number]').first().fill('7967')

  await page.locator('button', { hasText: /^Save$/ }).first().click()
  await page.waitForTimeout(3500)
  await page.reload()
  await page.waitForLoadState('networkidle')
  const t2 = await body()
  if (!t2.includes('100.00 kg')) throw new Error('CNG reading did not persist')
  if (!t2.includes('7,967')) throw new Error("the filler's cash did not persist")
})

await check('day close: CNG and BPCL both show', async () => {
  await page.goto(`${BASE}/day`)
  const t2 = await body()
  if (!t2.includes('BPCL card')) throw new Error('no BPCL line on day close')
  if (!/kg/.test(t2)) throw new Error('no kilograms on day close')
})

await check('money log: sold against how the money came', async () => {
  await page.goto(`${BASE}/moneylog`, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  const t2 = await body()

  for (const w of ['WHAT WAS SOLD', 'HOW THE MONEY CAME', 'Accounted for', 'Difference']) {
    if (!t2.includes(w)) throw new Error(`money log missing "${w}"`)
  }
  // all five ways money arrives must be on the page
  for (const w of ['Cash', 'ATM (card)', 'UPI', 'BPCL card', 'Udhaar']) {
    if (!t2.includes(w)) throw new Error(`money log missing the ${w} line`)
  }
  // and the fuels, each priced
  for (const w of ['Petrol', 'Diesel', 'CNG']) {
    if (!t2.includes(w)) throw new Error(`money log missing ${w}`)
  }

  // the money goes in here, on the page that looks like the book
  const boxes = page.locator('input[name="cash"], input[name="card"], input[name="upi"], input[name="bpcl"]')
  if ((await boxes.count()) < 4) throw new Error('nowhere to write the money in')
  // A filler may already have handed some over, so the page total is not
  // simply what is typed here. What matters is that the entry sticks.
  await page.locator('input[name="upi"]').first().fill('137')
  await page.locator('button', { hasText: 'Save what came in' }).first().click()
  await page.waitForTimeout(3000)
  await page.reload()
  await page.waitForLoadState('load')
  await page.waitForTimeout(800)
  const kept = await page.locator('input[name="upi"]').first().inputValue()
  if (Number(kept) !== 137) {
    throw new Error(`the money did not stay: box holds "${kept}"`)
  }

  // the difference belongs to the shift, so it can be written down there
  const f = page.locator('form').filter({ has: page.locator('input[name=note]') }).first()
  if ((await f.count()) === 0) throw new Error('nowhere to record the difference')
  await f.locator('input[name=note]').fill(`Counted together ${STAMP}`)
  await f.locator('button[type=submit]').click()
  await page.waitForTimeout(3000)
  await reflects(`Counted together ${STAMP}`)
  const after = await body()
  if (!after.includes('Agreed')) {
    throw new Error('the difference was not agreed against the shift')
  }
  // The two steps must say which is which — they used to be two unlabelled
  // buttons stacked on each other, and nobody could tell them apart.
  for (const w of ['STEP 1 · WRITE IN THE MONEY', 'STEP 2 · SETTLE THE DIFFERENCE']) {
    if (!after.includes(w)) throw new Error(`the money log is missing "${w}"`)
  }
  if (!/is short by|is over by|Nothing to settle/.test(after)) {
    throw new Error('the difference is not said in words, only on a button')
  }
})

await check('calendar: pick a date and get that day', async () => {
  // the header carries a real date control on every dated page
  await page.goto(`${BASE}/moneylog`, { waitUntil: 'load' })
  const picker = page.locator('header input[type=date]')
  if ((await picker.count()) === 0) throw new Error('no calendar control in the header')

  await page.goto(`${BASE}/daybook`, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  const t2 = await body()
  for (const w of ['DAYS TRADED', 'MON', 'SUN']) {
    if (!t2.includes(w)) throw new Error(`calendar missing "${w}"`)
  }

  // a day that traded is a link into that day's accounts
  const day = page.locator('a[href^="/moneylog?date="]').first()
  if ((await day.count()) === 0) throw new Error('no traded day to open')
  const href = await day.getAttribute('href')
  await day.click()
  await page.waitForURL(/\/moneylog\?date=/, { timeout: 15000 })
  if (!page.url().endsWith(href)) {
    throw new Error(`opened ${page.url()} instead of ${href}`)
  }
  await page.waitForTimeout(500)
  if (!(await body()).includes('WHAT WAS SOLD')) {
    throw new Error('that day\'s accounts did not open')
  }
})

console.log('\n=== PAYMENTS ===')
await check('payments: record one', async () => {
  await page.goto(`${BASE}/payments/new`)
  await selectContaining('select[name=customer_id]', `Transport ${STAMP}`)
  await page.fill('input[name=amount]', '5678')
  await page.fill('input[name=reference]', `REF${STAMP}`)
  await page.locator('button[type=submit]').last().click()
  await page.waitForURL(/\/payments$/, { timeout: 15000 })
  await reflects(`REF${STAMP}`)
})

await check('payments: EDIT the amount', async () => {
  await page.goto(`${BASE}/payments`)
  await openRowEditor(`REF${STAMP}`)
  const f = page.locator('td[colspan] form')
  await f.locator('input[name=amount]').fill('6789')
  await submitIn(f, 3000)
  await reflects('₹6,789.00')
})

await check('staff: EDIT the salary payment', async () => {
  await page.goto(`${BASE}/staff`)
  await openRowEditor('₹7,321.00')
  const f = page.locator('td[colspan] form')
  await f.locator('input[name=amount]').fill('7999')
  await submitIn(f, 3000)
  await reflects('₹7,999.00')
})

console.log('\n=== INVOICE ===')
await check('bills: the amount follows the dates, and the button knows', async () => {
  await page.goto(`${BASE}/invoices/new`, { waitUntil: 'load' })
  await selectContaining('select[name=customer_id]', `Transport ${STAMP}`)
  await page.waitForTimeout(500)

  // choosing a customer fills the dates that cover their unbilled slips
  const from = await page.locator('input[name=period_from]').inputValue()
  if (!from) throw new Error('the dates were not filled in for me')
  const withAmount = await body()
  if (!/FOR THESE DATES/.test(withAmount)) throw new Error('no amount shown for the dates')

  // move the range somewhere empty: the amount goes, and so does the button
  await page.fill('input[name=period_from]', '2020-01-01')
  await page.fill('input[name=period_to]', '2020-01-02')
  await page.waitForTimeout(400)
  if (!/No slips left to bill/.test(await body())) {
    throw new Error('an empty range still claimed an amount')
  }
  if (!(await page.locator('button[type=submit]').first().isDisabled())) {
    throw new Error('the bill could still be made with nothing in it')
  }

  // back to their dates, and make it
  await page.fill('input[name=period_from]', from)
  await page.fill('input[name=period_to]', await page.locator('input[name=period_to]').inputValue() || from)
  await page.fill('input[name=period_to]', from)
  await page.waitForTimeout(400)
  await page.locator('button[type=submit]').first().click()
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 15000 })
  await reflects('BILLED TO')
})

await check('bills: no button for a customer with nothing waiting', async () => {
  // the slip just billed above leaves this customer with nothing outstanding
  await page.goto(`${BASE}/customers`, { waitUntil: 'load' })
  await page.locator('a', { hasText: `Transport ${STAMP}` }).first().click()
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}/, { timeout: 15000 })
  await page.waitForTimeout(400)
  const t2 = await body()
  const unbilledNow = /Not billed yet[\s\S]{0,40}₹0\.00|Not billed yet[\s\S]{0,20}—/.test(t2)
  if (unbilledNow && (await page.locator('a[href^="/invoices/new"]').count()) !== 0) {
    throw new Error('offered a bill to a customer with nothing to bill')
  }
})

await check('bills: a printable page with nothing but the bill', async () => {
  // find a bill of our own rather than relying on where the last check ended
  await page.goto(`${BASE}/invoices`, { waitUntil: 'load' })
  const bill = page.locator('a[href^="/invoices/"]').filter({ hasNotText: 'Make' }).first()
  await bill.click()
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 15000 })
  await page.waitForTimeout(500)

  // the bill screen must offer a way off the screen
  const t2 = await body()
  if (!/Print \/ Save as PDF/.test(t2)) throw new Error('no print or save option on a bill')
  if (!/Rupees Only/.test(t2)) throw new Error('no amount in words on the bill')

  const url = page.url()
  await page.goto(`${url}/print`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  const t3 = await body()
  if (!t3.includes('BILLED TO')) throw new Error('the printable page has no bill on it')
  // and nothing of the app around it
  if ((await page.locator('header').count()) !== 0) {
    throw new Error('the app header leaked onto the printable bill')
  }
  const tabs = await page.locator('a').filter({ hasText: /^(Today|Udhaar|Fuel|Cash|More)$/ }).count()
  if (tabs !== 0) throw new Error('the tab bar leaked onto the printable bill')
})

await check('customers: the account history downloads as a file', async () => {
  await page.goto(`${BASE}/customers`, { waitUntil: 'load' })
  await page.locator('a[href^="/customers/"]').filter({ hasNotText: 'Add' }).first().click()
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}/, { timeout: 15000 })
  const link = page.locator('a[href$="/statement"]').first()
  if ((await link.count()) === 0) throw new Error('no download on the customer page')

  const res = await page.request.get(`${BASE}${await link.getAttribute('href')}`)
  if (res.status() !== 200) throw new Error(`download returned ${res.status()}`)
  const disp = res.headers()['content-disposition'] ?? ''
  if (!disp.includes('attachment')) throw new Error('not served as a download')
  if (!disp.includes('.csv')) throw new Error('not a csv')
  const text = await res.text()
  if (!text.includes('Still owed')) throw new Error('the file has no running balance')
})

console.log('\n=== DAY CLOSE ===')
await check('day: submit', async () => {
  await page.goto(`${BASE}/day`)
  const form = page.locator('form').filter({ has: page.locator('input[name=counted_cash]') })
  await form.locator('input[name=counted_cash]').fill('4242')
  await submitIn(form, 3000)
  await reflects('₹4,242.00')
})

/* ========================================================= as the owner == */
console.log('\n=== OWNER ===')
await login('father@test.in')

await check('day: owner approves', async () => {
  await page.goto(`${BASE}/day`)
  const form = page.locator('form').filter({ has: page.locator('textarea[name=remarks]') })
  await form.locator('textarea[name=remarks]').fill(`Checked ${STAMP}`)
  await submitIn(form, 3000)
  await reflects('Approved')
})

await check('day: owner reopens', async () => {
  await page.goto(`${BASE}/day`)
  const form = page.locator('form').filter({ has: page.locator('input[name=reason]') })
  await form.locator('input[name=reason]').fill('correction')
  await submitIn(form, 3000)
  const t = await body()
  if (!t.includes('Approve day')) throw new Error('still showing as approved after reopen')
})

await check('cng: owner sees the gas cost', async () => {
  await page.goto(`${BASE}/cng`)
  await openPanel('Record a CNG delivery')
  const f = page.locator('form').filter({ has: page.locator('input[name=kg_received]') })
  if ((await f.locator('input[name=rate_per_kg]').count()) === 0) {
    throw new Error('the owner cannot enter the gas rate')
  }
  await f.locator('input[name=tanker_number]').fill(`CT${STAMP}`)
  await f.locator('input[name=kg_received]').fill('3210')
  await f.locator('input[name=rate_per_kg]').fill('48.5')
  await submitIn(f, 3000)
  await reflects('₹1,55,685.00')
})

await check('stock: owner records cost', async () => {
  await page.goto(`${BASE}/stock`)
  await openPanel('Record delivery')
  const form = page.locator('form').filter({ has: page.locator('input[name=line_rate_per_litre]') })
  await form.locator('input[name=line_litres]').first().fill('5000')
  await form.locator('input[name=tanker_number]').fill(`TT${STAMP}`)
  await form.locator('input[name=line_rate_per_litre]').first().fill('84.5')
  await submitIn(form)
  await reflects('₹4,22,500.00')
})

await check('settings: owner renames the pump (header updates too)', async () => {
  await page.goto(`${BASE}/settings`)
  const form = page.locator('form').filter({ has: page.locator('input[name=invoice_prefix]') })
  await form.locator('input[name=name]').fill(`Rathod Petroleum ${STAMP}`)
  await submitIn(form, 3000)
  await reflects(`Rathod Petroleum ${STAMP}`)
})

await check('stock: the purchase rate is actually shown', async () => {
  await page.goto(`${BASE}/stock`)
  // The tanker heads its group; the rate belongs to the tank line under it.
  const lines = (await body()).split('\n')
  const at = lines.findIndex((l) => l.includes(`TT${STAMP}`))
  if (at < 0) throw new Error(`the tanker TT${STAMP} is not listed`)
  const under = lines.slice(at + 1, at + 6).join(' | ')
  if (!/84\.5/.test(under)) throw new Error(`purchase rate missing under the tanker: "${under}"`)
})

// A blocked write must say so. Approve the day, then have the manager try to
// delete something on it — silence here is the bug this suite exists for.
await check('an approved day refuses edits out loud', async () => {
  await page.goto(`${BASE}/day`)
  if ((await body()).includes('Approve day')) {
    const f = page.locator('form').filter({ has: page.locator('textarea[name=remarks]') })
    await f.locator('button[type=submit]').first().click()
    await page.waitForTimeout(3000)
  }
  await login('manager@test.in')
  await page.goto(`${BASE}/expenses`)
  await openPanel('Add expense')
  const f = page.locator('form').filter({ has: page.locator('input[name=category]') })
  await f.locator('input[name=category]').fill(`Blocked ${STAMP}`)
  await f.locator('input[name=amount]').fill('99')
  await submitIn(f, 3000)
  const t = await body()
  if (t.includes(`Blocked ${STAMP}`)) throw new Error('the write went through on a locked day')
  if (!/approved and locked|permission|Nothing was changed/i.test(t)) {
    throw new Error('the write was blocked but the app said nothing')
  }
})

/* ================================================= the counter device == */
// The locked-day check above left today approved, which correctly stops the
// counter writing anything. Reopen it so this section tests the normal path.
console.log('\n=== COUNTER DEVICE ===')
await login('father@test.in')
await page.goto(`${BASE}/day`)
if ((await body()).includes('Reopen day')) {
  const f = page.locator('form').filter({ has: page.locator('input[name=reason]') })
  await f.locator('input[name=reason]').fill('counter section')
  await f.locator('button[type=submit]').first().click()
  await page.waitForTimeout(2500)
}
await login('counter@test.in')

await check('counter: lands on its own screen', async () => {
  await page.goto(`${BASE}/expenses`)
  await page.waitForURL(/\/counter/, { timeout: 15000 })
  if (!(await body()).includes('Who is on duty?')) throw new Error('no filler picker')
})

await check('counter: a filler writes an udhaar slip, on their shift', async () => {
  await page.goto(`${BASE}/counter`)
  await page.locator('button', { hasText: 'Ramesh' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: 'Udhaar slip' }).first().click()
  await page.waitForTimeout(600)

  // The udhaar written in front of a filler belongs to their half of the day,
  // so the slip screen asks which — and offers only the two the pump runs.
  const t2 = await body()
  for (const w of ['Day shift', 'Night shift']) {
    if (!t2.includes(w)) throw new Error(`the counter slip screen is missing "${w}"`)
  }
  if (/Morning|Evening/.test(t2)) throw new Error('the counter still offers three shifts')
  await page.locator('button', { hasText: 'Night shift' }).first().click()
  await page.waitForTimeout(200)

  const sel = page.locator('select').first()
  const value = await sel.evaluate((el) => el.options[1]?.value)
  await sel.selectOption(value)
  await page.waitForTimeout(300)
  await page.locator('button', { hasText: /^Diesel$/ }).first().click()
  await page.waitForTimeout(300)
  await page.locator('input[type=number]').first().fill('37')
  await page.locator('button', { hasText: /^(Save|સાચવો)$/ }).first().click()
  await page.waitForTimeout(3000)
  if (!(await body()).includes('Saved')) throw new Error('no confirmation after saving')
})

// The filler starts and finishes their own shift, and may keep correcting it
// until the office agrees the figures.
await check('counter: a filler closes their own shift', async () => {
  await page.goto(`${BASE}/counter`)
  await page.locator('button', { hasText: 'Ramesh' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: 'My shift' }).first().click()
  await page.waitForTimeout(700)

  const t2 = await body()
  for (const w of ['Day shift', 'Night shift']) {
    if (!t2.includes(w)) throw new Error(`the shift screen is missing "${w}"`)
  }
  // A previous run may have left it handed in. Reopening is the filler's too,
  // so use it to get back to a shift they can close.
  const reopen = page.locator('button', { hasText: 'Reopen to fix something' })
  if ((await reopen.count()) > 0) {
    await reopen.first().click()
    await page.waitForTimeout(3000)
  }

  const finish = page.locator('button', { hasText: 'My shift is finished' })
  if ((await finish.count()) === 0) {
    throw new Error(`no way for a filler to close the shift: ${await body()}`)
  }
  await finish.first().click()
  await page.waitForTimeout(3000)

  const t3 = await body()
  if (!/waiting for the office/.test(t3)) throw new Error('the shift did not read as handed in')
  if ((await page.locator('button', { hasText: 'Reopen to fix something' }).count()) === 0) {
    throw new Error('the filler cannot reopen their own shift before it is agreed')
  }
})

await check('shifts: the office agrees the figures, and the filler is out', async () => {
  await login('father@test.in')
  await page.goto(`${BASE}/shifts`)
  await page.locator('a', { hasText: 'Meter readings' }).first().click()
  await page.waitForURL(/\/shifts\/[0-9a-f-]{36}/, { timeout: 20000 })
  await page.waitForTimeout(700)

  const agree = page.locator('button', { hasText: 'Agree these figures' })
  if ((await agree.count()) === 0) throw new Error('the office cannot agree the shift')
  await agree.first().click()
  await page.waitForTimeout(3000)
  if (!/Agreed at/.test(await body())) throw new Error('the shift does not say who agreed it')

  // and the office can undo it, which a filler cannot
  const reopen = page.locator('button', { hasText: 'Reopen for corrections' })
  if ((await reopen.count()) === 0) throw new Error('the office cannot reopen an agreed shift')
  await reopen.first().click()
  await page.waitForTimeout(3000)
  await login('counter@test.in')
})

await check('counter: the slip reached the books, on the shift it was tagged to', async () => {
  await login('manager@test.in')
  await page.goto(`${BASE}/credit`)
  const lines = (await body()).split('\n')
  const at = lines.findIndex((l) => l.includes('37.00 L'))
  if (at < 0) throw new Error('the counter slip is not in the credit list')
  // The row carries its shift, and the filler said night.
  if (!lines.slice(Math.max(0, at - 3), at + 2).join(' | ').includes('Night shift')) {
    throw new Error('the slip did not land on the night shift')
  }
})

// A slip must name a shift, and the office form offers the same two.
await check('credit: a slip names its shift', async () => {
  await page.goto(`${BASE}/credit/new`, { waitUntil: 'load' })
  const sel = page.locator('select[name=shift_name]')
  if ((await sel.count()) === 0) throw new Error('no shift on the slip form')
  if ((await sel.getAttribute('required')) === null) {
    throw new Error('a slip can still be written without a shift')
  }
  const options = await sel.locator('option').allTextContents()
  if (options.join(',') !== 'Day shift,Night shift') {
    throw new Error(`the slip form offers ${options.join(', ')}`)
  }

  const cust = page.locator('select[name=customer_id]')
  const names = await cust.locator('option').allTextContents()
  await cust.selectOption({ label: names.find((n) => n !== '—') })
  await sel.selectOption('Night')
  await page.locator('input[name=quantity]').first().fill('9')
  await page.locator('input[name=slip_number]').fill(`SH${STAMP}`)
  await page.locator('button[type=submit]').first().click()
  await page.waitForTimeout(3000)

  await page.goto(`${BASE}/credit`, { waitUntil: 'load' })
  const lines = (await body()).split('\n')
  const at = lines.findIndex((l) => l.includes(`SH${STAMP}`))
  if (at < 0) throw new Error('the slip was not saved')
  if (!lines.slice(Math.max(0, at - 3), at + 3).join(' | ').includes('Night shift')) {
    throw new Error('the slip does not show the shift it was written for')
  }
})

// Equipment is the owner's, and every change is recorded.
await checkAsOwner('settings: owner edits and deletes a nozzle', async () => {
  await page.goto(`${BASE}/settings`)
  await openPanel('Add — Nozzles')
  const f = page.locator('form')
    .filter({ has: page.locator('select[name=tank_id]') })
    .filter({ hasNot: page.locator('input[name=id]') })
  await f.locator('input[name=name]').fill(`N${STAMP}x`)
  await submitIn(f, 2500)
  await reflects(`N${STAMP}x`)

  // rename it through the row editor
  await openRowEditor(`N${STAMP}x`)
  const e = page.locator('td[colspan] form')
  await e.locator('input[name=name]').fill(`N${STAMP}y`)
  await submitIn(e, 2500)
  await reflects(`N${STAMP}y`)

  // and remove it, since nothing has been sold through it
  const row = page.locator('tr', { hasText: `N${STAMP}y` }).first()
  await row.locator('button[aria-label^="Delete"]').click()
  await page.waitForTimeout(2500)
  await gone(`N${STAMP}y`)
})

await check('settings: manager cannot touch the equipment', async () => {
  await page.goto(`${BASE}/settings`)
  const t2 = await body()
  if (!t2.includes('Only an owner can add or change')) {
    throw new Error('the manager was not told the equipment is owner-only')
  }
  if ((await page.locator('button[aria-label^="Edit N"]').count()) !== 0) {
    throw new Error('the manager was shown a nozzle editor')
  }
})

await checkAsOwner('audit: the trail shows who changed what', async () => {
  await page.goto(`${BASE}/audit`)
  const t2 = await body()
  for (const w of ['Nozzle', 'Added', 'Changed', 'Deleted']) {
    if (!t2.includes(w)) throw new Error(`audit trail missing "${w}"`)
  }
  if (!/Manager|Father/.test(t2)) throw new Error('audit trail names nobody')
})

// Last, once nothing else needs them: retire the filler this run invented,
// or the handover fills up with strangers who never worked here.
await check('staff: retire the one this run invented', async () => {
  await login('manager@test.in')
  await page.goto(`${BASE}/staff`, { waitUntil: 'load' })
  const block = page.locator('details').filter({ hasText: `Filler ${STAMP}` })
  await block.locator('summary').click()
  await page.waitForTimeout(400)
  const form = block.locator('form')
  await form.locator('input[name=is_active]').uncheck()
  await submitIn(form, 3000)
  await reflects('Left')
})

console.log(`\n${'='.repeat(60)}`)
console.log(`passed: ${pass}   failed: ${failures.length}`)
if (failures.length) console.log('\nFAILURES:\n' + failures.map((f) => ' - ' + f).join('\n'))
if (pageErrors.length) {
  console.log('\nPAGE / SERVER ERRORS:')
  ;[...new Set(pageErrors)].slice(0, 15).forEach((e) => console.log('  ' + e))
}
await browser.close()
process.exit(failures.length ? 1 : 0)
