import { chromium } from 'playwright-core'
const [file] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'msedge', headless: true })
for (const allow of [true, false]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: allow ? ['geolocation'] : [], geolocation: { latitude: -28.9969, longitude: 29.471 } })
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:4174/')
  await p.setInputFiles('input[type=file]', file)
  await p.locator('.trip-card').first().click()
  await p.getByRole('button', { name: /Map/ }).click()
  await p.waitForTimeout(800)
  await p.locator('.map-btn[title="Show my location"]').click()
  await p.waitForTimeout(allow ? 1500 : 3000)
  console.log(allow ? 'allowed:' : 'denied:', await p.locator('.map-msg').textContent().catch(() => 'no message'), '| blue dot:', await p.locator('path.leaflet-interactive[fill="#1982c4"]').count())
  await ctx.close()
}
await b.close()
