// Small Chrome DevTools Protocol driver for recording demo GIF frames.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

export async function connect(port = 9333) {
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json()
  const socket = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (socket.onopen = r))
  let id = 0
  const pending = new Map()
  const listeners = []
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? msg); pending.delete(msg.id) }
    else if (msg.method) listeners.forEach((fn) => fn(msg))
  }
  const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); socket.send(JSON.stringify({ id: n, method, params })) })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
  let mouse = { x: 0, y: 0 }

  const page = {
    send, wait, evaluate,
    async open(url, width = 1280, height = 800) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
      await send('Page.enable')
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = '.snowfall{display:none!important} #fake-cursor{position:fixed;z-index:99999;pointer-events:none;width:22px;height:22px;left:-50px;top:-50px;transition:none}'
          document.head.appendChild(style)
          const cursor = document.createElement('div')
          cursor.id = 'fake-cursor'
          cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#0a1424" stroke-width="1.6" stroke-linejoin="round"/></svg>'
          document.body.appendChild(cursor)
        })` })
      await send('Page.navigate', { url })
      await wait(5000)
    },
    async rect(selector) {
      return evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } })()`)
    },
    async scrollTo(selector, offset = 0) {
      await evaluate(`window.scrollTo(0, document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top + scrollY - ${offset})`)
      await wait(400)
    },
    // Moves the real mouse (hover events) and the drawn cursor together, in small steps
    async moveTo(x, y, ms = 600) {
      const steps = Math.max(1, Math.round(ms / 30))
      const from = { ...mouse }
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const px = from.x + (x - from.x) * ease
        const py = from.y + (y - from.y) * ease
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py })
        await evaluate(`(() => { const c = document.getElementById('fake-cursor'); c.style.left = '${px - 3}px'; c.style.top = '${py - 2}px' })()`)
        await wait(30)
      }
      mouse = { x, y }
    },
    async click(x, y) {
      await page.moveTo(x, y)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    },
    async clickOn(selector, ms = 600) {
      const r = await page.rect(selector)
      await page.moveTo(r.x + r.width / 2, r.y + r.height / 2, ms)
      await page.click(r.x + r.width / 2, r.y + r.height / 2)
    },
    async wheel(x, y, deltaY) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY })
    },
    async type(text, perChar = 45) {
      for (const char of text) { await send('Input.insertText', { text: char }); await wait(perChar) }
    },
    async setValue(selector, value) {
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })()`)
    },
    // Screencast frames (only sent when the screen changes) with their timestamps
    async record(dir, crop) {
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const frames = []
      const onFrame = async (msg) => {
        if (msg.method !== 'Page.screencastFrame') return
        const { data, metadata, sessionId } = msg.params
        const name = String(frames.length).padStart(4, '0') + '.png'
        writeFileSync(`${dir}/${name}`, Buffer.from(data, 'base64'))
        frames.push({ name, t: metadata.timestamp })
        send('Page.screencastFrameAck', { sessionId })
      }
      listeners.push(onFrame)
      await send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
      return async (holdEndMs = 2500) => {
        await wait(300)
        await send('Page.stopScreencast')
        listeners.splice(listeners.indexOf(onFrame), 1)
        writeFileSync(`${dir}/meta.json`, JSON.stringify({ crop, frames, holdEndMs }))
        return frames.length
      }
    },
    close: () => socket.close(),
  }
  return page
}
