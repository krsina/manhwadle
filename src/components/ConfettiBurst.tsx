import { useEffect, useRef } from 'react'

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
): Particle {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 3,
    vy: Math.sin(angle) * speed - Math.random() * 3,
    w: 5 + Math.random() * (firstTry ? 7 : 5),
    h: 8 + Math.random() * (firstTry ? 10 : 8),
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * (firstTry ? 0.5 : 0.35),
    color: pickColor(palette),
    life: 1,
    decay: firstTry ? 0.004 + Math.random() * 0.006 : 0.006 + Math.random() * 0.008,
    shape: firstTry && Math.random() < 0.4 ? 'star' : 'rect',
  }
}

function createBurst(
  width: number,
  height: number,
  firstTry: boolean,
): Particle[] {
  const palette = firstTry ? FIRST_TRY_COLORS : COLORS
  const cx = width / 2
  const cy = height * 0.42
  const particles: Particle[] = []
  const centerCount = firstTry
    ? Math.min(280, Math.floor((width * height) / 4500) + 180)
    : Math.min(140, Math.floor((width * height) / 9000) + 80)

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
      ),
    )
  }

  const sideCount = firstTry ? 80 : 36
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
      ),
    )
  }

  if (firstTry) {
    for (let ring = 0; ring < 3; ring++) {
      const ox = width * (0.28 + ring * 0.22)
      const oy = height * (0.18 + (ring % 2) * 0.06)
      for (let i = 0; i < 34; i++) {
        const angle = (Math.PI * 2 * i) / 34 + Math.random() * 0.2
        const speed = 6 + Math.random() * 10
        particles.push(makeParticle(ox, oy, angle, speed, palette, true))
      }
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

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let running = true
    let particles: Particle[] = []

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
    particles = createBurst(w, h, firstTry)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    const gravity = firstTry ? 0.14 : 0.18
    const drag = 0.99

    function tick() {
      if (!running || !ctx || !canvas) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.clearRect(0, 0, width, height)

      let alive = 0
      for (const p of particles) {
        if (p.life <= 0) continue
        alive++
        p.vx *= drag
        p.vy = p.vy * drag + gravity
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.spin
        p.life -= p.decay

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        if (p.shape === 'star') {
          drawStar(ctx, p.w, p.h)
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }

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
