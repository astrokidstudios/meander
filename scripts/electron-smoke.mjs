import { _electron as electron } from 'playwright-core'
const exe = 'release/win-unpacked/Meander.exe'
const OUT = process.argv[2]
async function run(first) {
  const app = await electron.launch({ executablePath: exe, args: [] })
  const win = await app.firstWindow()
  const errs = []
  win.on('pageerror', (e) => errs.push(String(e)))
  await win.waitForSelector('.home', { timeout: 15000 })
  if (first) {
    await win.getByRole('button', { name: '+ New trip' }).click()
    await win.getByPlaceholder('e.g. Lisbon, Portugal').fill('Desktop test')
    await win.getByRole('button', { name: 'Create trip' }).click()
    await win.waitForSelector('.day')
    await win.locator('#day-0 .add-row input').fill('Coffee')
    await win.locator('#day-0').getByRole('button', { name: 'Add', exact: true }).click()
    await win.waitForTimeout(500)
    await win.screenshot({ path: `${OUT}/8-electron.png` })
  } else {
    console.log('persisted trips:', await win.locator('.trip-card-name').allTextContents())
  }
  console.log('url', win.url(), 'errors', errs)
  await app.close()
}
await run(true)
await run(false)
