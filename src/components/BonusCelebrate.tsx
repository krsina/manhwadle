import { useEffect, useRef } from 'react'
import { frameScale } from '../lib/animationFrame'

interface BonusCelebrateProps {
  /** Remount or bump to replay */
  active: boolean
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  spin: number
  life: number
  decay: number
  color: string
}

interface Ring {
  x: number
  y: number
  radius: number
  max: number
  life: number
  width: number
  color: string
}

interface Star {
  x: number
  y: number
  size: number
  life: number
  delay: number
  twinkle: number
}

const COLORS = [
  '#fbbf24',
  '#f59e0b',
  '#fde68a',
  '#ffffff',
  '#86efac',
  '#34d399',
  '#a7f3d0',
  '#c4b5fd',
  '#60a5fa',
]

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Rare double-solve celebration for identifying both the series and character.
 */
export function BonusCelebrate({ active }: BonusCelebrateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    if (prefersReducedMotion()) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let running = true
    let lastTs = 0
    let lastFirework = performance.now()
    const sparks: Spark[] = []
    const rings: Ring[] = []
    const stars: Star[] = []

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { innerWidth: w, innerHeight: h } = window
      canvas!.width = Math.floor(w * dpr)
      canvas!.height = Math.floor(h * dpr)
      canvas!.style.width = `${w}px`
      canvas!.style.height = `${h}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      return { w, h }
    }

    const { w, h } = resize()
    const cx = w / 2
    const cy = h * 0.55

    function launchFirework(x: number, y: number, amount: number) {
      for (let i = rings.length - 1; i >= 0; i--) {
        if (rings[i]!.life <= 0) rings.splice(i, 1)
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        if (sparks[i]!.life <= 0) sparks.splice(i, 1)
      }

      const colorOffset = Math.floor(Math.random() * COLORS.length)
      rings.push({
        x,
        y,
        radius: 8,
        max: 100 + Math.random() * 90,
        life: 1,
        width: 2.5 + Math.random() * 2,
        color: COLORS[colorOffset]!,
      })

      for (let i = 0; i < amount; i++) {
        const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.18
        const speed = 2.5 + Math.random() * 8
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 1.5,
          size: 1.5 + Math.random() * 3.5,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.4,
          life: 1,
          decay: 0.009 + Math.random() * 0.012,
          color: COLORS[(colorOffset + Math.floor(Math.random() * 3)) % COLORS.length]!,
        })
      }
    }

    launchFirework(cx, cy, 150)

    for (let i = 0; i < 55; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 1.5 + Math.random() * 4,
        life: 1,
        // Delay in ~60fps frames (scaled in tick)
        delay: Math.random() * 34,
        twinkle: Math.random() * Math.PI * 2,
      })
    }

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    function tick(timestamp: number) {
      if (!running || !ctx || !canvas) return
      const dt = lastTs === 0 ? 1 : frameScale(timestamp - lastTs)
      lastTs = timestamp

      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.clearRect(0, 0, width, height)

      if (timestamp - lastFirework >= 800) {
        launchFirework(
          width * (0.15 + Math.random() * 0.7),
          height * (0.12 + Math.random() * 0.46),
          55 + Math.floor(Math.random() * 35),
        )
        lastFirework = timestamp
      }

      const sparkDrag = Math.pow(0.985, dt)

      for (const ring of rings) {
        if (ring.life <= 0) continue
        ring.radius += ((ring.max - ring.radius) * 0.08 + 1.8) * dt
        ring.life -= 0.016 * dt
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2)
        ctx.strokeStyle = ring.color
        ctx.globalAlpha = Math.max(0, ring.life) * 0.75
        ctx.lineWidth = ring.width
        ctx.stroke()
      }

      for (const spark of sparks) {
        if (spark.life <= 0) continue
        spark.vx *= sparkDrag
        spark.vy = spark.vy * sparkDrag + 0.08 * dt
        spark.x += spark.vx * dt
        spark.y += spark.vy * dt
        spark.rotation += spark.spin * dt
        spark.life -= spark.decay * dt

        ctx.save()
        ctx.translate(spark.x, spark.y)
        ctx.rotate(spark.rotation)
        ctx.globalAlpha = Math.max(0, spark.life)
        ctx.fillStyle = spark.color
        ctx.beginPath()
        ctx.moveTo(0, -spark.size)
        ctx.lineTo(spark.size * 0.55, 0)
        ctx.lineTo(0, spark.size)
        ctx.lineTo(-spark.size * 0.55, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      for (const star of stars) {
        if (star.delay > 0) {
          star.delay -= dt
          continue
        }
        if (star.life <= 0) continue
        star.life -= 0.009 * dt
        star.twinkle += 0.16 * dt
        const beam = star.size * (1 + Math.sin(star.twinkle) * 0.35)
        ctx.save()
        ctx.translate(star.x, star.y)
        ctx.globalAlpha = Math.max(0, star.life) * (0.5 + Math.sin(star.twinkle) * 0.3)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(-beam, 0)
        ctx.lineTo(beam, 0)
        ctx.moveTo(0, -beam)
        ctx.lineTo(0, beam)
        ctx.stroke()
        ctx.restore()
      }

      ctx.globalAlpha = 1

      if (running) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [active])

  if (!active) return null

  return <canvas ref={canvasRef} className="bonus-celebrate-canvas" aria-hidden="true" />
}
