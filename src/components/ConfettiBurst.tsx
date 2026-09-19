import { useEffect, useRef } from 'react'
import { frameScale } from '../lib/animationFrame'
import {
  confettiBurstPlan,
  confettiCanvasDpr,
  readCelebrationMotionTier,
} from '../lib/celebrationMotion'

interface ConfettiBurstProps {
  /** Remount or change this to replay the burst */
  active: boolean
  /** Extra fireworks for a first-try win */
  firstTry?: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rotation: number
  spin: number
  color: string
  life: number
  decay: number
  shape: 'rect' | 'star'
}

const COLORS = ['#3b82f6', '#60a5fa', '#86efac', '#22c55e', '#fde68a', '#f59e0b', '#f472b6', '#ffffff']
const FIRST_TRY_COLORS = [
  '#fbbf24',
  '#f59e0b',
  '#fde68a',
  '#ffffff',
  '#86efac',
  '#60a5fa',
  '#f472b6',
  '#fb7185',
]

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function pickColor(palette: string[]): string {
  return palette[Math.floor(Math.random() * palette.length)]!
}

function makeParticle(
  x: number,
  y: number,
  angle: number,
  speed: number,
  palette: string[],
  firstTry: boolean,
  stars: boolean,
  lite: boolean,
): Particle {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 3,
    vy: Math.sin(angle) * speed - Math.random() * 3,
    w: 5 + Math.random() * (firstTry && !lite ? 7 : 5),
    h: 8 + Math.random() * (firstTry && !lite ? 10 : 8),
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * (firstTry ? 0.5 : 0.35),
    color: pickColor(palette),
    life: 1,
    decay: lite
      ? 0.01 + Math.random() * 0.012
      : firstTry
        ? 0.004 + Math.random() * 0.006
        : 0.006 + Math.random() * 0.008,
    shape: stars && Math.random() < 0.4 ? 'star' : 'rect',
  }
}

function createBurst(
  width: number,
  height: number,
  firstTry: boolean,
  stars: boolean,
  centerCount: number,
  sideCount: number,
  ringCount: number,
  ringParticles: number,
  lite: boolean,
): Particle[] {
  const palette = firstTry ? FIRST_TRY_COLORS : COLORS
  const cx = width / 2
  const cy = height * 0.42
  const particles: Particle[] = []

  for (let i = 0; i < centerCount; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * (firstTry ? 1.85 : 1.35)
    const speed = (firstTry ? 10 : 7) + Math.random() * (firstTry ? 16 : 11)
    particles.push(
      makeParticle(
        cx + (Math.random() - 0.5) * (firstTry ? 140 : 80),
        cy + (Math.random() - 0.5) * 40,
        angle,
        speed,
        palette,
        firstTry,
        stars,
        lite,
      ),
    )
  }

  for (let i = 0; i < sideCount; i++) {
    const left = i % 2 === 0
    const angle = left
      ? -0.45 + Math.random() * 1.05
      : Math.PI + 0.45 - Math.random() * 1.05
    const speed = (firstTry ? 11 : 8) + Math.random() * (firstTry ? 14 : 10)
    particles.push(
      makeParticle(
        left ? width * 0.06 : width * 0.94,
        height * (firstTry ? 0.45 + Math.random() * 0.22 : 0.55),
        angle,
        speed,
        palette,
        firstTry,
        stars,
        lite,
      ),
    )
  }

  for (let ring = 0; ring < ringCount; ring++) {
    const ox = width * (0.28 + ring * 0.22)
    const oy = height * (0.18 + (ring % 2) * 0.06)
    for (let i = 0; i < ringParticles; i++) {
      const angle = (Math.PI * 2 * i) / ringParticles + Math.random() * 0.2
      const speed = 6 + Math.random() * 10
      particles.push(makeParticle(ox, oy, angle, speed, palette, true, stars, lite))
    }
  }

  return particles
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const r = Math.max(w, h) / 2
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    const b = a + Math.PI / 5
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    ctx.lineTo(Math.cos(b) * r * 0.45, Math.sin(b) * r * 0.45)
  }
  ctx.closePath()
  ctx.fill()
}

/** Full-screen confetti burst for win celebrations. */
export function ConfettiBurst({ active, firstTry = false }: ConfettiBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    if (prefersReducedMotion()) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true }) ?? canvas.getContext('2d')
    if (!ctx) return

    const tier = readCelebrationMotionTier()
    const plan = confettiBurstPlan(window.innerWidth, window.innerHeight, firstTry, tier)

    let frame = 0
    let running = true
    let lastTs = 0
    let particles: Particle[] = []
    let dpr = 1

    function resize() {
      dpr = confettiCanvasDpr(window.devicePixelRatio || 1, tier)
      const { innerWidth: w, innerHeight: h } = window
      canvas!.width = Math.floor(w * dpr)
      canvas!.height = Math.floor(h * dpr)
      canvas!.style.width = `${w}px`
      canvas!.style.height = `${h}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      return { w, h }
    }

    const { w, h } = resize()
    particles = createBurst(
      w,
      h,
      firstTry,
      plan.stars,
      plan.centerCount,
      plan.sideCount,
      plan.ringCount,
      plan.ringParticles,
      tier === 'lite',
    )

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    const gravity = plan.gravity
    const drag = 0.99
    const rotate = plan.rotate

    function tick(timestamp: number) {
      if (!running || !ctx || !canvas) return
      const dt = lastTs === 0 ? 1 : frameScale(timestamp - lastTs)
      lastTs = timestamp

      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // Convert per-frame drag into dt-scaled damping (drag^dt ≈ continuous).
      const frameDrag = Math.pow(drag, dt)

      let alive = 0
      for (const p of particles) {
        if (p.life <= 0) continue
        alive++
        p.vx *= frameDrag
        p.vy = p.vy * frameDrag + gravity * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= p.decay * dt
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color

        if (!rotate) {
          ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h)
          continue
        }

        p.rotation += p.spin * dt
        const cos = Math.cos(p.rotation)
        const sin = Math.sin(p.rotation)
        ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, p.x * dpr, p.y * dpr)
        if (p.shape === 'star') {
          drawStar(ctx, p.w, p.h)
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1

      if (alive > 0) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [active, firstTry])

  if (!active) return null

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />
}
