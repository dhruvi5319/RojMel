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
async function reflects(needle, waitMs = 10000) {
  // Wait for it rather than race a fixed sleep. The claim being tested is that
  // no reload is NEEDED, not that the change beats a stopwatch — and a dev
  // server compiling a route for the first time loses that race at random,
  // which failed a different add-form on every run.
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline && !(await body()).includes(needle)) {
    await page.waitForTimeout(250)
  }
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

async function login(email, password = 'pumpbook123', { expectIn = true } = {}) {
  await ctx.clearCookies()
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  // A removed account signs in and is turned straight back, so not every
  // login is expected to land inside the app.
  if (!expectIn) {
    await page.waitForTimeout(4000)
    return
  }
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

/**
 * Open the pencil that guards a panel of figures.
 *
 * Nothing on these screens is editable until somebody says they mean to change
 * it, so a test that types into a field has to ask for the field first.
 */
async function openEditor(label) {
  const pencil = page.getByRole('button', { name: label, exact: true })
  if ((await pencil.count()) > 0) {
    await pencil.first().click()
    await page.waitForTimeout(500)
  }
}

async function submitIn(scope, waitMs = 2500) {
  await scope.locator('button[type=submit]').first().click()
  await page.waitForTimeout(waitMs)
}

console.log('\n=== LOGIN ===')
await check('login: a password can be checked before it is sent', async () => {
  await ctx.clearCookies()
  await page.goto(`${BASE}/login`)
  const pwField = page.locator('input[autocomplete="current-password"]')
  await pwField.fill('whatever-was-typed')
  if ((await pwField.getAttribute('type')) !== 'password') {
    throw new Error('the password starts visible')
  }
  await page.getByRole('button', { name: 'Show password' }).click()
  if ((await pwField.getAttribute('type')) !== 'text') {
    throw new Error('the eye did not reveal the password')
  }
  if ((await pwField.inputValue()) !== 'whatever-was-typed') {
    throw new Error('revealing the password lost what was typed')
  }
  await page.getByRole('button', { name: 'Hide password' }).click()
  if ((await pwField.getAttribute('type')) !== 'password') {
    throw new Error('the eye did not hide the password again')
  }
  if (!(await body()).includes('Forgotten your password?')) {
    throw new Error('no word about a forgotten password')
  }
})

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
  await page.goto(`${BASE}/settings/equipment`, { waitUntil: 'load' })
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

await checkAsOwner('settings: a fuel measured in kilograms actually reaches /cng', async () => {
  // The unit is chosen once, here, and never again — the edit form only
  // shows it back fixed. Without this box every fuel silently became
  // litres, CNG included, and /cng's own "add a fuel measured in kilograms"
  // instruction had no way to be followed.
  await page.goto(`${BASE}/settings/equipment`, { waitUntil: 'load' })
  await openPanel('Fuels')
  const form = page.locator('form')
    .filter({ has: page.locator('select[name=unit]') })
    .filter({ hasNot: page.locator('input[name=id]') })
  await form.locator('input[name=name]').fill(`Biogas ${STAMP}`)
  await form.locator('select[name=unit]').selectOption('kg')
  await submitIn(form)
  await reflects(`Biogas ${STAMP}`)
  if (!(await body()).includes('/kg')) throw new Error('the new fuel did not save as kilograms')

  await page.goto(`${BASE}/cng`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  if ((await body()).includes('No CNG fuel set up yet')) {
    throw new Error('a kilogram fuel exists, but /cng still says none does')
  }

  // tidy up, so repeated runs do not fill the pump with invented fuels
  await page.goto(`${BASE}/settings/equipment`, { waitUntil: 'load' })
  const row = page.locator('tr', { hasText: `Biogas ${STAMP}` }).first()
  await row.locator('button[aria-label^="Delete"]').click()
  await page.waitForTimeout(2500)
  await gone(`Biogas ${STAMP}`)
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
  await page.goto(`${BASE}/settings/equipment`, { waitUntil: 'load' })
  if ((await body()).includes('Change rate')) {
    throw new Error('Settings still offers a second way to set the rate')
  }
})

await checkAsOwner('settings: add a tank', async () => {
  await page.goto(`${BASE}/settings/equipment`)
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
  await page.goto(`${BASE}/settings/equipment`)
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

await check('staff: rotates weekly, and shows this week\'s answer', async () => {
  await page.goto(`${BASE}/staff`)
  const block = page.locator('details').filter({ hasText: `Filler ${STAMP}` })
  await block.locator('summary').click()
  await page.waitForTimeout(400)
  const form = block.locator('form')
  await form.locator('select[name=shift_mode]').selectOption('rotate')
  await page.waitForTimeout(200)
  const week = form.locator('select[name=rotation_this_week]')
  if ((await week.count()) === 0) throw new Error('no "this week" field once rotating is chosen')
  await week.selectOption('Night')
  await submitIn(form)

  // Closed, the row now says which shift this week — not a fixed column, a
  // computed one — and reopening shows the same answer fed back as the
  // starting point, not last time's raw stored value.
  await reflects('this week')
  await page.reload()
  await page.waitForLoadState('load')
  await page.waitForTimeout(600)
  const block2 = page.locator('details').filter({ hasText: `Filler ${STAMP}` })
  await block2.locator('summary').click()
  await page.waitForTimeout(400)
  const form2 = block2.locator('form')
  if ((await form2.locator('select[name=shift_mode]').inputValue()) !== 'rotate') {
    throw new Error('rotating was not remembered')
  }
  if ((await form2.locator('select[name=rotation_this_week]').inputValue()) !== 'Night') {
    throw new Error('this week\'s answer was not fed back correctly')
  }
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

// Each role is shown its own job first. The fillers do the day as it happens,
// the manager checks it, the owner closes it — and nobody should be presented
// with somebody else's step as if it were theirs.
await check('today: the manager is shown her own job', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  const t = await body()

  // Her screen is her own work, in her order — not one shared list with other
  // people's names down the side of it.
  if (!/Yours to do today/i.test(t)) throw new Error('the manager is not shown her own steps')
  if (!/Count the cash box/.test(t)) throw new Error("the cash box is not one of her steps")
  if (!/Send to owner/.test(t)) throw new Error('handing the day over is not one of her steps')

  // The forecourt's half is shown as something that has happened, not as four
  // more tasks with her name against them.
  if (!/The forecourt has done/i.test(t)) {
    throw new Error("the fillers' work is not shown to her as status")
  }

  // and the month is not hers to see at all
  if (/This month so far|Left after costs/i.test(t)) {
    throw new Error('the manager was shown the owner-only month')
  }

  // the day is the owner's to close, whoever is looking
  await page.goto(`${BASE}/day`, { waitUntil: 'load' })
  const d = await body()
  if (!d.includes('Only the owner closes the day')) {
    throw new Error('the day page does not say whose act closing is')
  }
  if ((await page.locator('button', { hasText: 'Approve day' }).count()) !== 0) {
    throw new Error('a manager was offered the owner\'s approval')
  }
})

await checkAsOwner('today: the owner is shown the review, not the doing', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  const t = await body()

  // He opens on what is waiting for him and on the business, not on a list of
  // jobs that are somebody else's.
  if (!/waiting for you|Nothing is waiting for you/i.test(t)) {
    throw new Error('the owner is not told what is waiting for him')
  }
  if (!/This month so far/i.test(t)) throw new Error('the month is not on the owner\'s screen')
  if (!/Left after costs/i.test(t)) throw new Error('the owner is not shown what is left')

  // Setting the rate is the manager's job and is not offered to him as a step.
  if (/Yours to do today/i.test(t)) {
    throw new Error("the owner was shown the manager's to-do list")
  }

  // And on the day itself he sees what she counted, not her form to fill in.
  await page.goto(`${BASE}/day`, { waitUntil: 'load' })
  const d = await body()
  if (/Send to owner/.test(d)) {
    throw new Error("the owner was shown the manager's hand-over form")
  }
})

// Nobody signs themselves up. The owner keeps the office accounts, and a
// removed login must actually stop working — not merely lose its menu.
await check('account: anyone can change their own password', async () => {
  await page.goto(`${BASE}/account`, { waitUntil: 'load' })
  const f = page.locator('form').filter({ has: page.locator('input[name=current_password]') })
  if ((await f.count()) === 0) throw new Error('no way to change your own password')

  const set = async (current, next) => {
    await f.locator('input[name=current_password]').fill(current)
    await f.locator('input[name=password]').fill(next)
    await f.locator('input[name=password_again]').fill(next)
    await f.locator('button[type=submit]').first().click()
    await page.waitForTimeout(3000)
    return body()
  }

  // Somebody walking up to an unattended screen must not be able to change it.
  if (!/not your current password/.test(await set('wrongpass1', 'e2epassword1'))) {
    throw new Error('the wrong current password was accepted')
  }

  // From here the manager's password is not pumpbook123, and every later test
  // signs in with it. Put it back whatever happens — an assertion that throws
  // in between must not lock the suite out of its own pump.
  try {
    if (!/Password changed/.test(await set('pumpbook123', 'e2epassword1'))) {
      throw new Error('the password did not change')
    }
    await login('manager@test.in', 'e2epassword1')
  } finally {
    await page.goto(`${BASE}/account`, { waitUntil: 'load' })
    const g = page.locator('form').filter({ has: page.locator('input[name=current_password]') })
    await g.locator('input[name=current_password]').fill('e2epassword1')
    await g.locator('input[name=password]').fill('pumpbook123')
    await g.locator('input[name=password_again]').fill('pumpbook123')
    await g.locator('button[type=submit]').first().click()
    await page.waitForTimeout(3000)
  }
  if (!/Password changed/.test(await body())) throw new Error('the password was not put back')
  await login('manager@test.in')
})

await check('accounts: a manager may look but not touch', async () => {
  await page.goto(`${BASE}/people`, { waitUntil: 'load' })
  const t = await body()
  if (!t.includes('Who can sign in')) throw new Error('the manager cannot see who can sign in')
  if (t.includes('Add an account')) throw new Error('a manager was offered the add form')
})

await checkAsOwner('accounts: the owner adds one, and removing it locks it out', async () => {
  await page.goto(`${BASE}/people`, { waitUntil: 'load' })
  if (!(await body()).includes('Add an account')) {
    throw new Error('the owner cannot add an account')
  }

  // A fixed email, so repeated runs do not fill the project with logins.
  const email = 'e2e-temp@test.in'
  const name = 'E2E Temp'
  if (!(await body()).includes(name)) {
    await openPanel('Add an account')
    const f = page.locator('form').filter({ has: page.locator('input[name=email]') })
    await f.locator('input[name=full_name]').fill(name)
    await f.locator('input[name=email]').fill(email)
    await f.locator('select[name=role]').selectOption('manager')
    await f.locator('input[name=password]').fill('pumpbook123')
    await submitIn(f, 4000)
    await reflects(name)
  }

  // Make sure it is active, then take it away. "Removed" has to be read off
  // this row: another account may be removed too.
  const row = () => page.locator('tr', { hasText: name }).first()
  if ((await row().innerText()).includes('Removed')) {
    await row().locator('button[type=submit]').first().click()
    await page.waitForTimeout(3000)
  }
  await row().locator('button[type=submit]').first().click()
  await page.waitForTimeout(3000)
  if (!(await row().innerText()).includes('Removed')) {
    throw new Error(`the account was not removed: ${await row().innerText()}`)
  }

  // Removed means it cannot get in — not merely that its menu is smaller.
  await login(email, 'pumpbook123', { expectIn: false })
  const url = new URL(page.url())
  if (!url.pathname.startsWith('/login')) {
    throw new Error(`a removed account reached ${url.pathname}`)
  }
  if (!/no longer has access to a pump/.test(await body())) {
    throw new Error(`a removed account is not told why: ${await body()}`)
  }
  // and it stays out: the session it holds is no longer worth anything
  await page.goto(`${BASE}/moneylog`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  if (!new URL(page.url()).pathname.startsWith('/login')) {
    throw new Error('a removed account reached the money log')
  }
})

console.log('\n=== STOCK ===')
// One trip from the depot, decanted into two of our tanks. The tanker is
// entered once; the compartments are never written down.
await checkAsOwner('stock: record a delivery, one tanker into two tanks', async () => {
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

await checkAsOwner('stock: EDIT one tank off the delivery', async () => {
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
  await openEditor('Customer details')
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
  await openEditor('Meter readings')
  const cards = page.locator('input[type=number]')
  // first card: opening, closing, test, rate
  await cards.nth(1).fill('9999')
  await page.locator('button', { hasText: /^Save$/ }).first().click()
  await page.waitForTimeout(3000)
  await page.reload()
  await page.waitForLoadState('networkidle')
  // Shut, the page must still say what was saved — that is the whole point of
  // putting the readings behind a pencil.
  if (!(await body()).includes('9999.00')) {
    throw new Error('the saved closing reading is not shown with the form closed')
  }
  await openEditor('Meter readings')
  const val = await page.locator('input[type=number]').nth(1).inputValue()
  if (Number(val) !== 9999) throw new Error(`closing reading did not persist, got "${val}"`)
})

await check('shifts: CNG in kilograms, and cash from a filler', async () => {
  await page.goto(`${BASE}/shifts`)
  await page.locator('a', { hasText: 'Meter readings' }).first().click()
  await page.waitForURL(/\/shifts\/[0-9a-f-]{36}/, { timeout: 15000 })

  await openEditor('Meter readings')
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

  // Read it back out of the box it went into. Asserting on the page's
  // formatted total only worked while every other filler's box was empty —
  // the moment a second filler handed cash over, the total stopped being
  // this number and the test failed for the wrong reason.
  await openEditor('Meter readings')
  const kept = await page
    .locator('[aria-label="Handover"] input[type=number]')
    .first()
    .inputValue()
  if (Number(kept) !== 7967) {
    throw new Error(`the filler's cash did not persist: the box holds "${kept}"`)
  }
})

await check('day close: CNG and BPCL both show', async () => {
  await page.goto(`${BASE}/day`)
  const t2 = await body()
  if (!t2.includes('BPCL card')) throw new Error('no BPCL line on day close')
  if (!/kg/.test(t2)) throw new Error('no kilograms on day close')
})

await check('money log: sold against how the money came', async () => {
  // A fuel only appears on the money log if a meter says it left the pump, so
  // this test makes its own sales rather than leaning on what an earlier run
  // happened to leave behind.
  await page.goto(`${BASE}/shifts`)
  await page.locator('a', { hasText: 'Meter readings' }).first().click()
  await page.waitForURL(/\/shifts\/[0-9a-f-]{36}/, { timeout: 20000 })
  await page.waitForTimeout(700)

  // Every nozzle and dispenser on the shift, petrol through CNG, so every
  // fuel the pump sells has a meter that moved.
  await openEditor('Meter readings')
  const opens = page.getByLabel('Opening')
  const closes = page.getByLabel('Closing')
  const count = await closes.count()
  if (count === 0) throw new Error('the shift screen has no meters to read')
  for (let i = 0; i < count; i++) {
    const from = Number((await opens.nth(i).inputValue()) || 0)
    await closes.nth(i).fill(String(from + 100))
  }
  await page.locator('button', { hasText: /^Save$/ }).first().click()
  await page.waitForTimeout(3500)

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
  await openEditor('Step 1 · write in the money')
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
  await openEditor('Step 1 · write in the money')
  const kept = await page.locator('input[name="upi"]').first().inputValue()
  if (Number(kept) !== 137) {
    throw new Error(`the money did not stay: box holds "${kept}"`)
  }

  // the difference belongs to the shift, so it can be written down there
  await openEditor('Agree the difference')
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
  await openEditor('Cash counted')
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

// The real BPCL invoice this was modelled from: 5 KL of petrol, VAT 13.7%
// and a CESS of 4% charged on the value, the delivery charge AND the VAT. The
// basic amount is copied off the paper, because 5 x 81,326.69 is 406,633.45
// and the invoice says 406,633.46.
await check('stock: the owner copies the depot invoice across', async () => {
  await page.goto(`${BASE}/stock`)
  await openPanel('Record delivery')
  const form = page.locator('form').filter({ has: page.locator('input[name=line_basic]') })
  await form.locator('input[name=tanker_number]').fill(`TT${STAMP}`)
  await form.locator('input[name=invoice_number]').fill(`INV${STAMP}`)
  await form.locator('input[name=line_litres]').first().fill('5000')
  await form.locator('input[name=line_quantity_kl]').first().fill('5')
  await form.locator('input[name=line_rate_per_kl]').first().fill('81326.69')
  await form.locator('input[name=line_basic]').first().fill('406633.46')
  await form.locator('input[name=line_delivery_charge]').first().fill('3999.10')
  await form.locator('input[name=line_vat_rate]').first().fill('13.7')
  await form.locator('input[name=line_cess_rate]').first().fill('4')
  await page.waitForTimeout(500)

  // The form must show what the paper says before it is saved, or there is
  // nothing to check it against.
  const shown = await form.innerText()
  for (const figure of ['₹56,256.66', '₹18,675.57', '₹4,85,564.79']) {
    if (!shown.includes(figure)) {
      throw new Error(`the form does not work out ${figure} from the invoice`)
    }
  }

  await submitIn(form)
  await reflects('₹4,85,564.79')
})

await check('stock: a manager may read a delivery but not record one', async () => {
  await login('manager@test.in')
  await page.goto(`${BASE}/stock`, { waitUntil: 'load' })
  const t = await body()
  if (!t.includes(`TT${STAMP}`)) throw new Error('the manager cannot see the delivery')
  if (/Record delivery/.test(t)) throw new Error('a manager was offered the delivery form')
  if (!/only an owner records one/i.test(t)) {
    throw new Error('the manager is not told why she cannot record one')
  }
  if (/4,85,564/.test(t)) throw new Error('the manager was shown what the fuel cost')
  await login('father@test.in')
})

await check('settings: owner renames the pump (header updates too)', async () => {
  await page.goto(`${BASE}/settings`)
  await openEditor('Pump details')
  const form = page.locator('form').filter({ has: page.locator('input[name=invoice_prefix]') })
  await form.locator('input[name=name]').fill(`Rathod Petroleum ${STAMP}`)
  await submitIn(form, 3000)
  await reflects(`Rathod Petroleum ${STAMP}`)
})

await checkAsOwner('stock: the purchase cost is actually shown', async () => {
  await page.goto(`${BASE}/stock`)
  // The tanker heads its group; the cost belongs to the tank line under it.
  // The rate is typed per KL and kept per litre, so 81,326.69/KL reads 81.327.
  const lines = (await body()).split('\n')
  const at = lines.findIndex((l) => l.includes(`TT${STAMP}`))
  if (at < 0) throw new Error(`the tanker TT${STAMP} is not listed`)
  const under = lines.slice(at + 1, at + 6).join(' | ')
  if (!/81\.327/.test(under)) throw new Error(`the rate is missing: "${under}"`)
  if (!/4,85,564\.79/.test(under)) {
    throw new Error(`what the invoice came to is missing: "${under}"`)
  }
})

// A blocked write must say so. Approve the day, then have the manager try to
// delete something on it — silence here is the bug this suite exists for.
await check('an approved day refuses edits out loud', async () => {
  // Only an owner closes a day, so say so rather than depending on whoever
  // the last test happened to leave signed in.
  await login('father@test.in')
  await page.goto(`${BASE}/day`)
  if (!(await body()).includes('Approve day')) {
    throw new Error('the owner was not offered the approval, so nothing got locked')
  }
  const approve = page.locator('form').filter({ has: page.locator('textarea[name=remarks]') })
  await approve.locator('button[type=submit]').first().click()
  await page.waitForTimeout(3000)

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

/** Back to the counter, on whatever shift the device is holding. */
async function counter() {
  await page.goto(`${BASE}/counter`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
}

/** One of the three tabs along the bottom. */
async function tab(name) {
  await page.getByRole('button', { name, exact: true }).last().click()
  await page.waitForTimeout(700)
}

await check('counter: lands on its own screen', async () => {
  await page.goto(`${BASE}/expenses`)
  await page.waitForURL(/\/counter/, { timeout: 15000 })
  await page.waitForTimeout(700)
  const t = await body()
  if (!/No shift is running|Day shift|Night shift/.test(t)) {
    throw new Error(`not the counter screen: ${t}`)
  }
  // It never asks who is holding it: a shift has several fillers and any one
  // of them reads the meter.
  if (/Who are you/.test(t)) throw new Error('the device asked before showing anything')
})

// Nothing runs until somebody presses start. The clock says which shift is
// due and stamps the working day; it opens nothing.
await check('counter: nothing runs until a filler starts it', async () => {
  await counter()
  for (let i = 0; i < 3 && /Finish the shift/.test(await body()); i++) {
    await page.locator('button', { hasText: 'Finish the shift' }).first().click()
    await page.waitForTimeout(900)
    await page.locator('button', { hasText: 'The shift is finished' }).first().click()
    await page.waitForTimeout(2500)
    await counter()
  }
  const t = await body()
  if (!/No shift is running/.test(t)) {
    throw new Error(`the device did not come to rest: ${t}`)
  }
  if (!/The clock does not start it/.test(t)) {
    throw new Error('the screen does not say the clock will not start it')
  }
  // and with nothing running there is nothing to write into
  const udhaar = page.getByRole('button', { name: 'Udhaar', exact: true }).last()
  if (!(await udhaar.isDisabled())) throw new Error('a slip could be written with no shift')
})

await check('counter: a filler starts the shift, and the book says who', async () => {
  await counter()
  await page.locator('button', { hasText: 'Start a shift' }).first().click()
  await page.waitForTimeout(700)

  const t = await body()
  if (!/Which shift is this/.test(t)) throw new Error('the start sheet does not offer a shift')
  if (!/not seven o/.test(t)) {
    throw new Error('the sheet does not say the hour is the moment it is pressed')
  }
  if (!/Who is on it/.test(t)) throw new Error('who is standing there is not asked at the start')

  await page.getByRole('button', { name: 'Ramesh', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.locator('button').filter({ hasText: /^(Start the shift|Start it again) —/ })
    .first().click()
  await page.waitForTimeout(4000)

  // It lands on the shift itself, not the meter walk — nothing needs doing
  // there at the start any more, since a new shift opens on whatever the
  // last one closed at. (Whether "Meters" reads as done depends on whether
  // this exact shift slot was already closed earlier the same day, in an
  // earlier run — start_shift() reopens it rather than starting fresh, and
  // reopening keeps whatever readings it already had — so that is not
  // asserted here; the clean-slate case is covered in test:db instead.)
  const t2 = await body()
  if (!/Running/.test(t2)) throw new Error(`the shift is not running: ${t2}`)
  if (!/started/.test(t2)) throw new Error('the shift does not say when it began')
})

await check('counter: the walk round the forecourt', async () => {
  await counter()
  if (!/Reads now/.test(await body())) {
    await page.locator('button', { hasText: /Meters (read|not read)/ }).first().click()
    await page.waitForTimeout(800)
  }
  const meters = page.locator('input[aria-label^="Reads now"]')
  const count = await meters.count()
  if (count === 0) throw new Error('the walk has no meters')

  // Every meter above the mark it is compared with: a meter cannot go back.
  // The mark sits beside its own box, so read it from that row and not from
  // the card, which holds every row's.
  const marks = await meters.evaluateAll((boxes) =>
    boxes.map((box) => {
      const row = box.parentElement?.parentElement
      const found = (row?.textContent ?? '').match(/At the start ([0-9.]+)/)
      return found ? Number(found[1]) : null
    }))
  for (let i = 0; i < count; i++) {
    const base = marks[i] ?? Number((await meters.nth(i).inputValue()) || 0)
    await meters.nth(i).fill((base + 60 + i).toFixed(3))
  }
  await page.waitForTimeout(500)
  // The figure a filler can check by eye.
  if (!/Gone through since then/.test(await body())) {
    throw new Error('the walk does not show what has gone through the nozzle')
  }
  const save = page.locator('button', { hasText: 'Save the reading' }).first()
  if (await save.isDisabled()) throw new Error('Save stayed asleep after the meters changed')
  await save.click()
  await page.waitForTimeout(3500)

  for (const w of ['Went out of the pump', 'Of that, on udhaar', 'Cash to hand over']) {
    if (!(await body()).includes(w)) throw new Error(`the hissab is missing "${w}"`)
  }
})

await check('counter: an udhaar slip, and the slips written this shift', async () => {
  await counter()
  // An exact name: "Udhaar slip" is also inside "4 udhaar slips written",
  // and hasText matches substrings without regard to case.
  await page.getByRole('button', { name: 'Udhaar slip', exact: true }).first().click()
  await page.waitForTimeout(800)

  const t = await body()
  if (/Which shift are you on/.test(t)) throw new Error('the slip asks the shift a second time')
  if (!/Who is serving/.test(t)) throw new Error('the slip does not ask who served the lorry')

  // Nothing typed yet and nothing found are two different silences, and
  // used to look identical. A nonsense search says plainly that it found
  // nobody, rather than leaving an empty box with no explanation.
  await page.locator('input#counter-customer').fill('Zzz Not A Real Customer Zzz')
  await page.waitForTimeout(500)
  if (!(await body()).includes('No customer matches that')) {
    throw new Error('a search with no matches says nothing about it')
  }

  await page.locator('input#counter-customer').fill('Shree')
  await page.waitForTimeout(600)
  await page.locator('button', { hasText: /^Shree/ }).first().click()
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: /^Diesel$/ }).first().click()
  await page.waitForTimeout(300)
  await page.locator('input[type=number]').first().fill('43')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Ramesh', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.locator('button', { hasText: 'Write the slip' }).first().click()
  await page.waitForTimeout(3500)

  // It lands on the slips written during this shift — which the device could
  // not show at all before, so a filler could not check their own work.
  if (!/Udhaar this shift/.test(await body())) {
    throw new Error(`the slip did not land on the shift's udhaar: ${await body()}`)
  }
  if (!/43\.00 L/.test(await body())) throw new Error('the slip is not in the list')

  await page.reload()
  await page.waitForTimeout(1200)
  await tab('Udhaar')
  if (!/43\.00 L/.test(await body())) throw new Error('the slip was GONE after a reload')
})

await check('counter: a slip written wrong is the filler’s to put right', async () => {
  await counter()
  await tab('Udhaar')
  await page.locator('button', { hasText: /^Fix$/ }).first().click()
  await page.waitForTimeout(800)
  await page.locator('input[type=number]').first().fill('46')
  await page.waitForTimeout(300)
  await page.locator('button', { hasText: 'Save the change' }).first().click()
  await page.waitForTimeout(3500)
  if (!/46\.00 L/.test(await body())) throw new Error('the correction did not show')

  await page.reload()
  await page.waitForTimeout(1200)
  await tab('Udhaar')
  if (!/46\.00 L/.test(await body())) throw new Error('the correction was GONE after a reload')
})

await check('counter: the filler counts the cash they hand over', async () => {
  await counter()
  // A bare timeout here says nothing about what the device was showing, and
  // this one has failed in a long run while passing on its own.
  const step = page.locator('button', { hasText: /Cash (not counted|counted)/ }).first()
  if ((await step.count()) === 0) {
    throw new Error(`no cash step on the shift screen — showing: ${(await body()).slice(0, 300)}`)
  }
  try {
    await step.click({ timeout: 10000 })
  } catch {
    throw new Error(
      `could not press the cash step ` +
      `(visible=${await step.isVisible()} enabled=${await step.isEnabled()} ` +
      `box=${JSON.stringify(await step.boundingBox())}) — showing: ${(await body()).slice(0, 250)}`)
  }
  await page.waitForTimeout(800)

  const t = await body()
  // The kicker is uppercased in CSS, so innerText comes back shouting.
  if (!/what the meters say is owed/i.test(t)) {
    throw new Error('the count does not show what is owed')
  }
  if (!/a filler answers for cash/i.test(t)) {
    throw new Error('the screen does not say the card machine is the pump’s')
  }
  if (!/card, upi, bpcl/i.test(await body())) {
    throw new Error('no card/UPI/BPCL section on the cash screen')
  }

  // Cash is counted note by note, not typed as one number: open the first
  // filler's row and fill in a few denominations rather than a lump sum.
  const fillerRow = page.locator('button').filter({ hasText: /₹|Nothing counted/i }).first()
  if ((await fillerRow.count()) === 0) throw new Error('nobody to count cash for')
  await fillerRow.click()
  await page.waitForTimeout(400)

  const denomBoxes = page.locator('input[id^="cash-"]')
  if ((await denomBoxes.count()) !== 9) {
    throw new Error(`expected 9 denomination boxes, got ${await denomBoxes.count()}`)
  }
  // ₹500×5 + ₹200×1 + ₹50×1 = 2750, in the largest-first order the boxes list.
  await denomBoxes.nth(0).fill('5') // ₹500
  await denomBoxes.nth(1).fill('1') // ₹200
  await denomBoxes.nth(3).fill('1') // ₹50
  await page.waitForTimeout(400)
  if (!(await body()).includes('2,750.00')) {
    throw new Error('the notes and coins do not add up to the subtotal shown')
  }
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  await page.waitForTimeout(300)

  if (!/(less|more) than expected|It tallies/.test(await body())) {
    throw new Error('the count does not say how it compares with what is owed')
  }
  await page.locator('button', { hasText: 'Save the count' }).first().click()
  await page.waitForTimeout(3500)
  await reflects('₹2,750.00')

  // And the breakdown itself survives a reload, not just the total.
  await page.reload()
  await page.waitForLoadState('load')
  await page.waitForTimeout(700)
  const cashStepAgain = page.locator('button', { hasText: /Cash (not counted|counted)/ }).first()
  await cashStepAgain.click()
  await page.waitForTimeout(600)
  await page.locator('button').filter({ hasText: '2,750.00' }).first().click()
  await page.waitForTimeout(400)
  const kept = page.locator('input[id^="cash-"]')
  if ((await kept.nth(0).inputValue()) !== '5') throw new Error('the ₹500 count did not survive a reload')
  if ((await kept.nth(1).inputValue()) !== '1') throw new Error('the ₹200 count did not survive a reload')
  if ((await kept.nth(3).inputValue()) !== '1') throw new Error('the ₹50 count did not survive a reload')
})

await check('counter: card and UPI are handled at the nozzle, and subtract from what is owed', async () => {
  await counter()
  await page.locator('button', { hasText: /Cash (not counted|counted)/ }).first().click()
  await page.waitForTimeout(700)

  const owed = page.locator('span.text-\\[32px\\]').first()

  // A run before this one may have already saved a card/UPI figure here, and
  // this shift is reused run after run — so the baseline is whatever is
  // actually in the boxes now, zeroed first, not an assumed clean slate.
  await page.locator('#pay-card').fill('0')
  await page.locator('#pay-upi').fill('0')
  await page.locator('#pay-bpcl').fill('0')
  await page.waitForTimeout(400)
  const before = Number((await owed.innerText()).replace(/[₹,]/g, ''))

  // Whoever swiped the card or showed the QR knows the shift's own total —
  // one figure each, not counted per filler the way cash is.
  await page.locator('#pay-card').fill('700')
  await page.locator('#pay-upi').fill('300')
  await page.waitForTimeout(400)
  const after = Number((await owed.innerText()).replace(/[₹,]/g, ''))
  if (before - after !== 1000) {
    throw new Error(`typing ₹700 card + ₹300 UPI should drop what's owed by exactly ₹1,000: ${before} -> ${after}`)
  }

  await page.locator('button', { hasText: 'Save the count' }).first().click()
  await page.waitForTimeout(3000)

  // Saving moves off the cash screen back to the shift itself, so the figure
  // is checked by reopening it — not by reflects(), which only ever looks at
  // whatever screen is showing right after the action.
  await page.reload()
  await page.waitForLoadState('load')
  await page.waitForTimeout(700)
  await page.locator('button', { hasText: /Cash (not counted|counted)/ }).first().click()
  await page.waitForTimeout(700)
  if ((await page.locator('#pay-card').inputValue()) !== '700') {
    throw new Error('the card total did not survive a reload')
  }

  // It reaches the office's own money log, the same row, not a copy of it.
  await login('manager@test.in')
  await page.goto(`${BASE}/moneylog`, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  if (!(await body()).includes('700.00')) {
    throw new Error('the card total the counter entered does not show on the money log')
  }
  await login('counter@test.in')
})

await check('counter: the device says which shift it is on, and moves', async () => {
  await counter()
  await page.getByRole('button', { name: /Which shift/ }).first().click()
  await page.waitForTimeout(800)

  const t = await body()
  if (!/today at the pump/i.test(t)) throw new Error('the picker does not show the working day')
  if (!/presses start, not when the clock/.test(t)) {
    throw new Error('the picker still says the clock starts a shift')
  }

  // Onto the other half of the day, which must say loudly that it is not the
  // shift being worked — a slip written there would leave this one short.
  const other = page.locator('button').filter({ hasText: /^Day shift/ }).first()
  if ((await other.count()) === 0) throw new Error('the other shift is not offered')
  await other.click()
  await page.waitForTimeout(3000)
  if (!/This is not the shift running now|Running/.test(await body())) {
    throw new Error(`moving shift said nothing: ${await body()}`)
  }
  const back = page.locator('text=Back to the shift running now')
  if ((await back.count()) > 0) {
    await back.first().click()
    await page.waitForTimeout(3000)
    if (/This is not the shift running now/.test(await body())) {
      throw new Error('going back did not return to the running shift')
    }
  }
})

// A shift is worked by several fillers. Who is standing there is settled when
// it starts, and changed here when the night turns out differently.
await check('counter: who is on this shift', async () => {
  await counter()
  await tab('Who is on')
  const t = await body()
  if (!/On this shift/.test(t)) throw new Error('no list of who is on the shift')
  if (!/Somebody else came in|Nobody is down for this shift/.test(t)) {
    throw new Error('no way to say somebody covered')
  }

  const add = page.locator('button', { hasText: /^Filler / }).first()
  if ((await add.count()) > 0) {
    const name = (await add.innerText()).split('\n').pop()
    await add.click()
    await page.waitForTimeout(3000)
    if (!/Covering/.test(await body())) {
      throw new Error('somebody who came in for a colleague was not marked as covering')
    }
    const off = page.locator('button', { hasText: /^Remove$/ })
    if ((await off.count()) > 1) {
      await off.last().click()
      await page.waitForTimeout(2500)
    }
    if (!name) throw new Error('the cover had no name')
  }
})

await check('counter: the shift is handed in', async () => {
  await counter()
  await page.locator('button', { hasText: 'Finish the shift' }).first().click()
  await page.waitForTimeout(900)

  const t = await body()
  if (!/Hand in the shift/.test(t)) throw new Error('no hand-in sheet')
  if (!/Who worked it/.test(t)) throw new Error('the sheet does not name who worked it')

  await page.locator('button', { hasText: 'The shift is finished' }).first().click()
  await page.waitForTimeout(3500)

  await counter()
  const t2 = await body()
  if (!/No shift is running|Handed in/.test(t2)) {
    throw new Error(`the shift did not read as handed in: ${t2}`)
  }
})

await check('counter: the device can be handed back', async () => {
  // Signed in as the pump there was no way off this screen at all — no sign
  // out, and every other route redirects back here — so a device could not be
  // handed to the office without clearing the browser.
  await counter()
  const out = page.getByRole('button', { name: 'Sign out', exact: true })
  if ((await out.count()) === 0) throw new Error('the counter offers no way to sign out')
  await out.first().click()
  await page.waitForTimeout(600)

  const sheet = await body()
  if (!/Sign this device out\?/.test(sheet)) throw new Error('no hand-back sheet')
  // It must say what it does and does not cost, or nobody on the forecourt
  // dares press it.
  if (!/Nothing is lost/.test(sheet)) throw new Error('the sheet does not say the shift is safe')
  if (!/password/.test(sheet)) throw new Error('the sheet does not warn about signing back in')

  // Backing out leaves the device exactly where it was.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.waitForTimeout(500)
  if (/Sign this device out\?/.test(await body())) throw new Error('Cancel did not go back')

  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.locator('button:has-text("Sign out")').last().click()
  await page.waitForURL(/\/login/, { timeout: 30000 })
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
  // The quantity the counter section wrote, after the filler corrected it.
  const at = lines.findIndex((l) => l.includes('46.00 L'))
  if (at < 0) throw new Error('the counter slip is not in the credit list')
  // The row carries whichever shift was running when it was written — which
  // one that is depends on the hour the suite runs, but it must be one of them.
  if (!/Day shift|Night shift/.test(lines.slice(Math.max(0, at - 3), at + 2).join(' | '))) {
    throw new Error('the slip did not land on a shift')
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
  await page.goto(`${BASE}/settings/equipment`)
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
  await page.goto(`${BASE}/settings/equipment`)
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
