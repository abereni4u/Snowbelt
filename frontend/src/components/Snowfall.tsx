// Gentle snowfall behind the page (Role 3). One canvas, a few hundred flakes at most, paused
// when the tab is hidden and turned off for people who ask for reduced motion.
import { useEffect, useRef } from 'react'

interface Flake {
  x: number
  y: number
  r: number
  speed: number
  drift: number
  phase: number
  crystal: boolean
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, turn: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(turn)
  ctx.beginPath()
  for (let arm = 0; arm < 6; arm++) {
    ctx.rotate(Math.PI / 3)
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -size)
    ctx.moveTo(0, -size * 0.55)
    ctx.lineTo(size * 0.22, -size * 0.75)
    ctx.moveTo(0, -size * 0.55)
    ctx.lineTo(-size * 0.22, -size * 0.75)
  }
  ctx.stroke()
  ctx.restore()
}

export default function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let width = 0
    let height = 0
    let flakes: Flake[] = []
    let frame = 0
    const ratio = Math.min(window.devicePixelRatio || 1, 2)

    function makeFlake(anywhere: boolean): Flake {
      const crystal = Math.random() < 0.06
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : -10,
        r: crystal ? 4 + Math.random() * 4 : 0.6 + Math.random() * 1.8,
        speed: 0.25 + Math.random() * 0.6,
        drift: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        crystal,
      }
    }

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = width * ratio
      canvas!.height = height * ratio
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
      const count = Math.round(Math.min(220, (width * height) / 9000))
      flakes = Array.from({ length: count }, () => makeFlake(true))
    }

    function tick(time: number) {
      const color = getComputedStyle(canvas!).color
      ctx!.clearRect(0, 0, width, height)
      ctx!.fillStyle = color
      ctx!.strokeStyle = color
      ctx!.lineWidth = 1
      for (const flake of flakes) {
        flake.y += flake.speed * (flake.crystal ? 0.7 : 1)
        flake.x += Math.sin(time / 2400 + flake.phase) * flake.drift * 0.4
        if (flake.y > height + 10) Object.assign(flake, makeFlake(false))
        ctx!.globalAlpha = flake.crystal ? 0.35 : 0.25 + flake.r / 4
        if (flake.crystal) {
          drawCrystal(ctx!, flake.x, flake.y, flake.r, time / 9000 + flake.phase)
        } else {
          ctx!.beginPath()
          ctx!.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2)
          ctx!.fill()
        }
      }
      frame = requestAnimationFrame(tick)
    }

    function onVisibility() {
      cancelAnimationFrame(frame)
      if (!document.hidden) frame = requestAnimationFrame(tick)
    }

    resize()
    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="snowfall" aria-hidden="true" />
}
