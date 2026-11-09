import { connect } from '../lib.mjs'
const page = await connect()
await page.open('http://localhost:5173/', 1280, 900)
await page.scrollTo('#readiness', 76)
const card = await page.rect('#readiness')
const crop = { x: card.x, y: card.y, width: card.width, height: Math.min(900 - card.y - 8, card.height + 112) }
const stop = await page.record(process.env.FRAMES + '/readiness', crop)
await page.moveTo(card.x + 300, card.y + 100, 10)
await page.wait(700)
const rows = ['have', 'need', 'have', 'have', 'need', 'have', 'need']
for (let i = 0; i < rows.length; i++) {
  await page.clickOn(`#readiness .ready-row:nth-child(${i + 1}) button${rows[i] === 'need' ? '.need' : ':not(.need)'}`, 450)
  await page.wait(250)
}
await page.wait(900)
await page.moveTo(card.x + 140, (await page.rect('.get-option .btn')).y + 16, 700)
await page.wait(1500)
console.log('frames', await stop(3000))
page.close()
