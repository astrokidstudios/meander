import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4174/')
await page.getByRole('button', { name: '+ New trip' }).click()
await page.getByPlaceholder('e.g. Lisbon, Portugal').fill('Lisbon, Portugal')
await page.getByRole('button', { name: 'Create trip' }).click()
const day1 = page.locator('#day-0')
for (const q of ['Tower of Belem', 'Jeronimos Monastery', 'Time Out Market Lisboa', 'Praca do Comercio']) {
  await day1.locator('.add-row input').fill(q)
  await day1.getByRole('button', { name: 'Search' }).click()
  await day1.locator('.results li button').first().waitFor({ timeout: 15000 })
  await day1.locator('.results li button').first().click()
  await page.waitForTimeout(1100)
}
await day1.locator('.day-plan-bar input[type=time]').fill('09:00')
await page.waitForTimeout(400)
console.log((await day1.locator('.stop-clock, .leg').allTextContents()).join('\n'))
console.log('route:', await day1.getByRole('link', { name: /Google Maps/ }).getAttribute('href'))
await page.screenshot({ path: `${OUT}/9-timeline.png` })
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/10-timeline-phone.png` })
console.log('errors', errors)
await browser.close()
