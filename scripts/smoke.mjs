import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const URL = 'http://127.0.0.1:4174/'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Dropped test pin' : undefined))
await page.goto(URL)
await page.screenshot({ path: `${OUT}/1-home.png` })
await page.getByRole('button', { name: '+ New trip' }).click()
await page.getByPlaceholder('e.g. Lisbon, Portugal').fill('Lisbon, Portugal')
await page.getByRole('button', { name: 'Create trip' }).click()
await page.waitForSelector('.day')
const day1 = page.locator('#day-0')
async function searchAdd(dayLoc, q) {
  await dayLoc.locator('.add-row input').fill(q)
  await dayLoc.getByRole('button', { name: 'Search' }).click()
  await dayLoc.locator('.results li button').first().waitFor({ timeout: 15000 })
  await dayLoc.locator('.results li button').first().click()
  await page.waitForTimeout(1100) // be polite to Nominatim (1 req/s)
}
for (const q of ['Belem Tower', 'Jeronimos Monastery', 'Time Out Market Lisboa', 'Praca do Comercio']) await searchAdd(day1, q)
const day2 = page.locator('#day-1')
for (const q of ['Castelo de Sao Jorge', 'Miradouro da Senhora do Monte']) await searchAdd(day2, q)
// manual add without search
await day2.locator('.add-row input').fill('Fado dinner')
await day2.getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/2-itinerary-desktop.png` })
// optimise day 1
const opt = day1.getByRole('button', { name: /Optimise route/ })
if (await opt.count()) { await opt.click(); await page.waitForTimeout(400) }
console.log('notice:', await page.locator('.notice').first().textContent().catch(() => ''))
// edit a stop
await day2.locator('.stop-main', { hasText: 'Fado dinner' }).click()
await page.locator('.modal input[type=time]').first().fill('20:00')
await page.locator('.modal').getByLabel(/Cost/).fill('45')
await page.locator('.modal').getByRole('button', { name: 'Save' }).click()
// budget
await page.getByRole('button', { name: /Budget/ }).click()
await page.getByPlaceholder('What was it?').fill('Hotel deposit')
await page.getByPlaceholder(/Amount/).fill('220')
await page.locator('.expense-form').getByRole('button', { name: 'Add' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/3-budget.png` })
// notes
await page.getByRole('button', { name: /Notes/ }).click()
await page.getByRole('button', { name: /basic packing list/ }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/4-notes.png` })
// mobile
await page.setViewportSize({ width: 390, height: 844 })
await page.getByRole('button', { name: /Itinerary/ }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/5-mobile-plan.png` })
await page.getByRole('button', { name: /Map/ }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/6-mobile-map.png` })
// offline reload
await page.waitForTimeout(1500)
await ctx.setOffline(true)
await page.reload()
await page.waitForTimeout(1500)
console.log('offline title:', await page.locator('.trip-title h1').textContent().catch(() => 'FAILED'))
console.log('offline stops:', await page.locator('.pin').count())
await page.screenshot({ path: `${OUT}/7-offline.png` })
console.log('errors:', JSON.stringify(errors.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED')), null, 1))
await browser.close()
