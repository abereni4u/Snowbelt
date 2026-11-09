import { connect } from '../lib.mjs'
const page = await connect()
await page.send('Browser.grantPermissions', { origin: 'http://localhost:5173', permissions: ['geolocation'] })
await page.send('Emulation.setGeolocationOverride', { latitude: 43.001, longitude: -78.789, accuracy: 50 })
await page.open('http://localhost:5173/')
await page.scrollTo('#map', 76)
const crop = await page.rect('.map-card')
const map = await page.rect('.map')
// Zoom in on the Buffalo cluster before recording
for (let i = 0; i < 3; i++) { await page.wheel(map.x + 360, map.y + 185, -100); await page.wait(600) }
await page.wait(1200)
const pins = await page.evaluate(`[...document.querySelectorAll('.leaflet-marker-icon')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: el.title } })`)
const inside = pins.filter((p) => p.x > map.x + 70 && p.x < map.x + map.width - 200 && p.y > map.y + 60 && p.y < map.y + map.height - 120)
console.log(inside.map((p) => p.title + ' ' + Math.round(p.x) + ',' + Math.round(p.y)).join('\n'))
const pick = []
for (const title of ['Shelter', 'Police station', 'Warming center', 'Government / town hall']) {
  const found = inside.find((p) => p.title === title && pick.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 60))
  if (found) pick.push(found)
}
const stop = await page.record(process.env.FRAMES + '/pins', crop)
await page.moveTo(map.x + 120, map.y + 120, 10)
await page.wait(700)
for (const p of pick.slice(0, 3)) { await page.moveTo(p.x, p.y + 4, 900); await page.wait(2200) }
await page.moveTo(map.x + 200, map.y + map.height - 60, 700)
await page.wait(400)
await page.clickOn('.locate-btn', 900)
await page.wait(2500)
console.log('frames', await stop(2000))
page.close()
