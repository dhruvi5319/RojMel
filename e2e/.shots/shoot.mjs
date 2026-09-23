import { chromium } from 'playwright'
const BASE = 'http://localhost:3000'
const OUT = '/private/tmp/claude-501/-Users-dhruvirathod-Desktop-project-GasStationManagement/b5a9d410-0c64-46f9-bdb3-0eec77a14009/scratchpad/shots'
const who = process.argv[2]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1050 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`)
await page.fill('input[type=email]', `${who}@test.in`)
await page.fill('input[type=password]', 'pumpbook123')
await page.click('button[type=submit]')
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
for (const p of process.argv.slice(3)) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  const name = `${who}${p.replace(/\//g, '_') || '_home'}_edit.png`
  await page.screenshot({ path: `${OUT}/${name}` })
  console.log(name)
}
await browser.close()
