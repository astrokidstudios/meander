import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'msedge', headless: true })
const p = await (await b.newContext()).newPage()
await p.goto('http://127.0.0.1:4177/')
await p.waitForSelector('.trip-card-name', { timeout: 8000 })
console.log('trips:', await p.locator('.trip-card-name').allTextContents())
await p.reload(); await p.waitForTimeout(1500)
console.log('after reload:', await p.locator('.trip-card-name').allTextContents())
await b.close()
