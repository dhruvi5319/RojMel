import { chromium } from 'playwright'
const BASE = 'http://localhost:3000'
const OUT = '/private/tmp/claude-501/-Users-dhruvirathod-Desktop-project-GasStationManagement/b5a9d410-0c64-46f9-bdb3-0eec77a14009/scratchpad/shots'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1050 } })
const page = await ctx.newPage()
page.on('response', (r) => { if (r.status() >= 500) console.log('HTTP', r.status(), r.url().slice(0, 80)) })
await page.goto(`${BASE}/login`)
await page.fill('input[type=email]', 'father@test.in')
await page.fill('input[type=password]', 'pumpbook123')
await page.click('button[type=submit]')
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
await page.goto(`${BASE}/shifts`, { waitUntil: 'load' })
await page.waitForTimeout(900)
await page.locator('a', { hasText: 'Meter readings' }).first().click()
await page.waitForURL(/\/shifts\/[0-9a-f-]{36}/, { timeout: 20000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/shift_detail_view.png` })
console.log('inputs visible before edit:', await page.locator('input[type=number]').count())
const edit = page.getByRole('button', { name: 'Meter readings' })
console.log('edit buttons:', await edit.count())
if (await edit.count()) {
  await edit.first().click()
  await page.waitForTimeout(900)
  console.log('inputs after edit:', await page.locator('input[type=number]').count())
  await page.screenshot({ path: `${OUT}/shift_detail_edit.png` })
}
await browser.close()
