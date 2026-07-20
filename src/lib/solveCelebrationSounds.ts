/** Anime / manhwa first-try + golden double-solve SFX pairs (Web Audio). */

export type SolveCelebrationId = 'first-try' | 'double-solve'

export type SolveSoundPairId =
  | 'volt-arc'
  | 'shadow-bolt'
  | 'system-alert'
  | 'blade-spark'
  | 'thunder-gate'
  | 'rift-tear'
  | 'blood-pulse'
  | 'ki-flare'
  | 'neon-surge'
  | 'frost-arc'

export interface SolveSoundPairOption {
  id: SolveSoundPairId
  label: string
  blurb: string
}

export const SOLVE_SOUND_PAIRS: readonly SolveSoundPairOption[] = [
  {
    id: 'volt-arc',
    label: 'Volt Arc',
    blurb: 'Instant blue lightning crit → golden storm awakening.',
  },
  {
    id: 'shadow-bolt',
    label: 'Shadow Bolt',
    blurb: 'Monarch smash → full shadow dominion surge.',
  },
  {
    id: 'system-alert',
    label: 'System Alert',
    blurb: 'Hard HUD lock-on → emergency golden system override.',
  },
  {
    id: 'blade-spark',
    label: 'Blade Spark',
    blurb: 'Steel critical slash → ultimate sword-release burst.',
  },
  {
    id: 'thunder-gate',
    label: 'Thunder Gate',
    blurb: 'Sky-split strike → heaven-cracking golden thunder.',
  },
  {
    id: 'rift-tear',
    label: 'Rift Tear',
    blurb: 'Reality snap → dimensional collapse + golden tear.',
  },
  {
    id: 'blood-pulse',
    label: 'Blood Pulse',
    blurb: 'Predator heartbeat hit → berserk golden awakening.',
  },
  {
    id: 'ki-flare',
    label: 'Ki Flare',
    blurb: 'Compressed aura detonation → martial golden flare.',
  },
  {
    id: 'neon-surge',
    label: 'Neon Surge',
    blurb: 'Overclock zap → city-wide neon golden overload.',
  },
  {
    id: 'frost-arc',
    label: 'Frost Arc',
    blurb: 'Ice-shatter crit → sovereign blizzard discharge.',
  },
] as const

export const DEFAULT_SOLVE_SOUND_PAIR: SolveSoundPairId = 'system-alert'
export const SOLVE_SOUND_PAIR_STORAGE_KEY = 'manhwadle:solve-sound-pair'

const PAIR_IDS = new Set<string>(SOLVE_SOUND_PAIRS.map((p) => p.id))

function isSolveSoundPairId(value: unknown): value is SolveSoundPairId {
  return typeof value === 'string' && PAIR_IDS.has(value)
}

export function loadSolveSoundPairId(): SolveSoundPairId {
  try {
    const raw = localStorage.getItem(SOLVE_SOUND_PAIR_STORAGE_KEY)
    if (isSolveSoundPairId(raw)) return raw
  } catch {
    // Ignore private mode / storage failures
  }
  return DEFAULT_SOLVE_SOUND_PAIR
}

export function saveSolveSoundPairId(id: SolveSoundPairId): void {
  try {
    localStorage.setItem(SOLVE_SOUND_PAIR_STORAGE_KEY, id)
  } catch {
    // Ignore quota / private mode failures
  }
}

let sharedCtx: AudioContext | null = null
let lastPlayKey: string | null = null
let lastPlayAt = 0

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AC()
  }
  return sharedCtx
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  {
    freq,
    start,
    duration,
    type = 'sine',
    gain = 0.12,
    attack = 0.012,
    decay = 0.18,
    slideTo,
  }: {
    freq: number
    start: number
    duration: number
    type?: OscillatorType
    gain?: number
    attack?: number
    decay?: number
    slideTo?: number
  },
): void {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), start + duration)
  }
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(duration, attack + decay))
  osc.connect(env)
  env.connect(dest)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  {
    start,
    duration,
    gain = 0.08,
    filterFreq = 1800,
    type = 'bandpass' as BiquadFilterType,
  }: {
    start: number
    duration: number
    gain?: number
    filterFreq?: number
    type?: BiquadFilterType
  },
): void {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = filterFreq
  filter.Q.value = 0.7
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + 0.006)
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  src.connect(filter)
  filter.connect(env)
  env.connect(dest)
  src.start(start)
  src.stop(start + duration + 0.02)
}

/** Hotter bus so first-try / golden cues read as powerful. */
function masterBus(ctx: AudioContext): GainNode {
  const input = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 10
  comp.ratio.value = 2.4
  comp.attack.value = 0.003
  comp.release.value = 0.16
  input.gain.value = 1.05
  input.connect(comp)
  comp.connect(ctx.destination)
  return input
}

/** Shared heavy body hit under anime impacts. */
function bodyHit(ctx: AudioContext, dest: AudioNode, start: number, power = 1): void {
  tone(ctx, dest, {
    freq: 95,
    start,
    duration: 0.32 * power,
    type: 'sine',
    gain: 0.16 * power,
    attack: 0.003,
    decay: 0.26 * power,
    slideTo: 40,
  })
  tone(ctx, dest, {
    freq: 55,
    start: start + 0.01,
    duration: 0.4 * power,
    type: 'triangle',
    gain: 0.1 * power,
    attack: 0.004,
    decay: 0.32 * power,
    slideTo: 30,
  })
  noiseBurst(ctx, dest, {
    start,
    duration: 0.1,
    gain: 0.1 * power,
    filterFreq: 450,
    type: 'lowpass',
  })
}

/** Rising power ladder — first-try resolve energy. */
function powerClimb(
  ctx: AudioContext,
  dest: AudioNode,
  start: number,
  freqs: readonly number[],
  gain = 0.1,
): void {
  freqs.forEach((freq, i) => {
    const t = start + i * 0.055
    tone(ctx, dest, {
      freq,
      start: t,
      duration: 0.28,
      type: 'sawtooth',
      gain: gain * 0.45,
      attack: 0.006,
      decay: 0.2,
    })
    tone(ctx, dest, {
      freq,
      start: t,
      duration: 0.26,
      type: 'triangle',
      gain: gain + i * 0.008,
      attack: 0.005,
      decay: 0.18,
    })
  })
}

/** Golden resolve wall — stacked power chord after the big hit. */
function goldenWall(
  ctx: AudioContext,
  dest: AudioNode,
  start: number,
  freqs: readonly number[],
): void {
  freqs.forEach((freq, i) => {
    const t = start + i * 0.035
    tone(ctx, dest, {
      freq,
      start: t,
      duration: 1.1,
      type: 'sawtooth',
      gain: 0.055,
      attack: 0.02,
      decay: 0.9,
    })
    tone(ctx, dest, {
      freq,
      start: t,
      duration: 1.05,
      type: 'triangle',
      gain: 0.1 - i * 0.008,
      attack: 0.018,
      decay: 0.85,
    })
    tone(ctx, dest, {
      freq: freq * 2,
      start: t + 0.03,
      duration: 0.7,
      type: 'sine',
      gain: 0.04,
      attack: 0.02,
      decay: 0.55,
    })
  })
}

async function withAudioContext(
  play: (ctx: AudioContext) => void,
  debounceKey: string,
): Promise<void> {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (debounceKey === lastPlayKey && now - lastPlayAt < 180) return
  lastPlayKey = debounceKey
  lastPlayAt = now

  const ctx = getCtx()
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    return
  }
  play(ctx)
}

type PairPlayer = (ctx: AudioContext) => void

// --- Volt Arc ---

function playVoltArcFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  // Instant lightning crit
  noiseBurst(ctx, input, { start: t0, duration: 0.1, gain: 0.14, filterFreq: 3800 })
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.08,
    gain: 0.1,
    filterFreq: 5500,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 2800,
    start: t0,
    duration: 0.16,
    type: 'sawtooth',
    gain: 0.07,
    attack: 0.002,
    decay: 0.12,
    slideTo: 380,
  })
  tone(ctx, input, {
    freq: 1900,
    start: t0,
    duration: 0.14,
    type: 'sine',
    gain: 0.1,
    attack: 0.002,
    decay: 0.11,
    slideTo: 260,
  })
  bodyHit(ctx, input, t0 + 0.02, 1.15)
  powerClimb(ctx, input, t0 + 0.12, [392, 523, 659, 880], 0.11)
  // Residual arcs
  ;[0.32, 0.4, 0.48].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.045,
      gain: 0.06,
      filterFreq: 3000 + i * 400,
    })
  })
}

function playVoltArcDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  // Aggressive charge
  tone(ctx, input, {
    freq: 60,
    start: t0,
    duration: 0.55,
    type: 'sine',
    gain: 0.14,
    attack: 0.05,
    decay: 0.45,
    slideTo: 180,
  })
  tone(ctx, input, {
    freq: 200,
    start: t0 + 0.04,
    duration: 0.55,
    type: 'sawtooth',
    gain: 0.06,
    attack: 0.06,
    decay: 0.42,
    slideTo: 1400,
  })
  tone(ctx, input, {
    freq: 400,
    start: t0 + 0.08,
    duration: 0.5,
    type: 'sine',
    gain: 0.08,
    attack: 0.06,
    decay: 0.4,
    slideTo: 2200,
  })
  noiseBurst(ctx, input, { start: t0 + 0.05, duration: 0.5, gain: 0.08, filterFreq: 1600 })
  ;[0.12, 0.2, 0.28, 0.34, 0.4, 0.46].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.05,
      gain: 0.05 + i * 0.012,
      filterFreq: 2000 + i * 400,
      type: i % 2 ? 'highpass' : 'bandpass',
    })
    tone(ctx, input, {
      freq: 1000 + i * 220,
      start: t0 + d,
      duration: 0.08,
      type: 'sine',
      gain: 0.05,
      attack: 0.002,
      decay: 0.06,
      slideTo: 280,
    })
  })
  const hit = t0 + 0.52
  noiseBurst(ctx, input, { start: hit, duration: 0.18, gain: 0.16, filterFreq: 800, type: 'lowpass' })
  noiseBurst(ctx, input, {
    start: hit,
    duration: 0.14,
    gain: 0.14,
    filterFreq: 4200,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 3200,
    start: hit,
    duration: 0.22,
    type: 'sawtooth',
    gain: 0.08,
    attack: 0.002,
    decay: 0.16,
    slideTo: 140,
  })
  bodyHit(ctx, input, hit, 1.45)
  goldenWall(ctx, input, hit + 0.08, [130.81, 196, 261.63, 329.63, 392, 523.25])
  ;[0.25, 0.4, 0.55, 0.72, 0.9].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: hit + d,
      duration: 0.06,
      gain: 0.07 - i * 0.008,
      filterFreq: 2800 + i * 250,
    })
    tone(ctx, input, {
      freq: 1600 - i * 140,
      start: hit + d,
      duration: 0.14,
      type: 'sine',
      gain: 0.055,
      attack: 0.002,
      decay: 0.1,
      slideTo: 320,
    })
  })
}

// --- Shadow Bolt ---

function playShadowBoltFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 42,
    start: t0,
    duration: 0.35,
    type: 'sine',
    gain: 0.18,
    attack: 0.008,
    decay: 0.28,
    slideTo: 28,
  })
  noiseBurst(ctx, input, { start: t0, duration: 0.12, gain: 0.12, filterFreq: 550, type: 'lowpass' })
  tone(ctx, input, {
    freq: 1100,
    start: t0 + 0.04,
    duration: 0.16,
    type: 'sawtooth',
    gain: 0.065,
    attack: 0.002,
    decay: 0.12,
    slideTo: 160,
  })
  noiseBurst(ctx, input, {
    start: t0 + 0.05,
    duration: 0.1,
    gain: 0.1,
    filterFreq: 2600,
    type: 'highpass',
  })
  bodyHit(ctx, input, t0 + 0.03, 1.2)
  powerClimb(ctx, input, t0 + 0.14, [277, 349, 415, 554], 0.1)
}

function playShadowBoltDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 36,
    start: t0,
    duration: 0.75,
    type: 'sine',
    gain: 0.18,
    attack: 0.08,
    decay: 0.6,
    slideTo: 55,
  })
  noiseBurst(ctx, input, { start: t0 + 0.05, duration: 0.65, gain: 0.09, filterFreq: 320, type: 'lowpass' })
  ;[0.15, 0.25, 0.34, 0.42].forEach((d, i) => {
    tone(ctx, input, {
      freq: 140 + i * 50,
      start: t0 + d,
      duration: 0.18,
      type: 'sawtooth',
      gain: 0.055,
      attack: 0.008,
      decay: 0.14,
      slideTo: 70,
    })
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.08,
      gain: 0.07,
      filterFreq: 1400 + i * 350,
    })
  })
  const hit = t0 + 0.55
  bodyHit(ctx, input, hit, 1.5)
  noiseBurst(ctx, input, {
    start: hit,
    duration: 0.16,
    gain: 0.14,
    filterFreq: 3000,
    type: 'highpass',
  })
  goldenWall(ctx, input, hit + 0.06, [82.41, 123.47, 164.81, 207.65, 246.94, 329.63])
  tone(ctx, input, {
    freq: 220,
    start: hit + 0.12,
    duration: 1.1,
    type: 'triangle',
    gain: 0.09,
    attack: 0.05,
    decay: 0.9,
  })
}

// --- System Alert ---

function playSystemAlertFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  // Hard lock-on pings
  ;[880, 1175, 1568].forEach((freq, i) => {
    tone(ctx, input, {
      freq,
      start: t0 + i * 0.055,
      duration: 0.1,
      type: 'sine',
      gain: 0.11,
      attack: 0.002,
      decay: 0.07,
    })
  })
  noiseBurst(ctx, input, {
    start: t0 + 0.16,
    duration: 0.06,
    gain: 0.08,
    filterFreq: 4500,
    type: 'highpass',
  })
  bodyHit(ctx, input, t0 + 0.18, 1.1)
  powerClimb(ctx, input, t0 + 0.22, [523, 659, 784, 1047], 0.105)
}

function playSystemAlertDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (let i = 0; i < 6; i += 1) {
    tone(ctx, input, {
      freq: 700 + i * 110,
      start: t0 + i * 0.055,
      duration: 0.07,
      type: 'sine',
      gain: 0.08,
      attack: 0.002,
      decay: 0.05,
    })
  }
  tone(ctx, input, {
    freq: 180,
    start: t0 + 0.3,
    duration: 0.4,
    type: 'sawtooth',
    gain: 0.07,
    attack: 0.04,
    decay: 0.32,
    slideTo: 1200,
  })
  noiseBurst(ctx, input, { start: t0 + 0.3, duration: 0.4, gain: 0.08, filterFreq: 2000 })
  const hit = t0 + 0.6
  tone(ctx, input, {
    freq: 1240,
    start: hit,
    duration: 0.18,
    type: 'sine',
    gain: 0.13,
    attack: 0.002,
    decay: 0.14,
  })
  tone(ctx, input, {
    freq: 1860,
    start: hit + 0.08,
    duration: 0.3,
    type: 'sine',
    gain: 0.11,
    attack: 0.003,
    decay: 0.24,
  })
  bodyHit(ctx, input, hit, 1.4)
  goldenWall(ctx, input, hit + 0.1, [196, 247, 294, 370, 440, 587])
  noiseBurst(ctx, input, {
    start: hit + 0.05,
    duration: 0.18,
    gain: 0.1,
    filterFreq: 3600,
    type: 'highpass',
  })
}

// --- Blade Spark ---

function playBladeSparkFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.09,
    gain: 0.14,
    filterFreq: 5200,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 2200,
    start: t0,
    duration: 0.14,
    type: 'sawtooth',
    gain: 0.075,
    attack: 0.002,
    decay: 0.1,
    slideTo: 320,
  })
  tone(ctx, input, {
    freq: 1200,
    start: t0 + 0.02,
    duration: 0.18,
    type: 'triangle',
    gain: 0.1,
    attack: 0.002,
    decay: 0.14,
    slideTo: 400,
  })
  bodyHit(ctx, input, t0 + 0.03, 1.2)
  powerClimb(ctx, input, t0 + 0.14, [440, 554, 659, 880], 0.11)
  tone(ctx, input, {
    freq: 1320,
    start: t0 + 0.35,
    duration: 0.45,
    type: 'sine',
    gain: 0.07,
    attack: 0.01,
    decay: 0.35,
    slideTo: 780,
  })
}

function playBladeSparkDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, { start: t0, duration: 0.4, gain: 0.07, filterFreq: 2400 })
  tone(ctx, input, {
    freq: 280,
    start: t0,
    duration: 0.45,
    type: 'sawtooth',
    gain: 0.065,
    attack: 0.06,
    decay: 0.35,
    slideTo: 1400,
  })
  ;[0.15, 0.24, 0.32, 0.4].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.05,
      gain: 0.08,
      filterFreq: 4000 + i * 400,
      type: 'highpass',
    })
  })
  const hit = t0 + 0.48
  noiseBurst(ctx, input, {
    start: hit,
    duration: 0.12,
    gain: 0.16,
    filterFreq: 5600,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 2600,
    start: hit,
    duration: 0.2,
    type: 'sawtooth',
    gain: 0.08,
    attack: 0.002,
    decay: 0.15,
    slideTo: 180,
  })
  bodyHit(ctx, input, hit, 1.5)
  goldenWall(ctx, input, hit + 0.08, [146.83, 220, 293.66, 369.99, 440, 554.37])
  tone(ctx, input, {
    freq: 880,
    start: hit + 0.15,
    duration: 0.95,
    type: 'sine',
    gain: 0.08,
    attack: 0.02,
    decay: 0.75,
    slideTo: 520,
  })
  ;[0.35, 0.5, 0.68].forEach((d) => {
    noiseBurst(ctx, input, {
      start: hit + d,
      duration: 0.05,
      gain: 0.06,
      filterFreq: 3400,
      type: 'highpass',
    })
  })
}

// --- Thunder Gate ---

function playThunderGateFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, { start: t0, duration: 0.14, gain: 0.1, filterFreq: 380, type: 'lowpass' })
  bodyHit(ctx, input, t0 + 0.02, 1.25)
  noiseBurst(ctx, input, {
    start: t0 + 0.06,
    duration: 0.12,
    gain: 0.13,
    filterFreq: 3200,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 1800,
    start: t0 + 0.06,
    duration: 0.16,
    type: 'sine',
    gain: 0.09,
    attack: 0.002,
    decay: 0.12,
    slideTo: 220,
  })
  powerClimb(ctx, input, t0 + 0.16, [349, 466, 587, 740], 0.11)
}

function playThunderGateDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, { start: t0, duration: 0.55, gain: 0.1, filterFreq: 280, type: 'lowpass' })
  tone(ctx, input, {
    freq: 40,
    start: t0,
    duration: 0.65,
    type: 'sine',
    gain: 0.15,
    attack: 0.1,
    decay: 0.5,
  })
  ;[0.18, 0.3, 0.4, 0.48].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.09,
      gain: 0.07 + i * 0.02,
      filterFreq: 1400 + i * 500,
    })
  })
  const hit = t0 + 0.58
  noiseBurst(ctx, input, { start: hit, duration: 0.24, gain: 0.17, filterFreq: 480, type: 'lowpass' })
  noiseBurst(ctx, input, {
    start: hit,
    duration: 0.16,
    gain: 0.14,
    filterFreq: 4500,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 2400,
    start: hit,
    duration: 0.22,
    type: 'sawtooth',
    gain: 0.075,
    attack: 0.002,
    decay: 0.16,
    slideTo: 120,
  })
  bodyHit(ctx, input, hit, 1.55)
  goldenWall(ctx, input, hit + 0.08, [98, 146.83, 196, 246.94, 293.66, 392])
  ;[0.28, 0.48, 0.7, 0.95].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: hit + d,
      duration: 0.2,
      gain: 0.09 - i * 0.015,
      filterFreq: 320,
      type: 'lowpass',
    })
  })
}

// --- Rift Tear ---

function playRiftTearFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 360,
    start: t0,
    duration: 0.2,
    type: 'sawtooth',
    gain: 0.075,
    attack: 0.01,
    decay: 0.16,
    slideTo: 1600,
  })
  tone(ctx, input, {
    freq: 520,
    start: t0 + 0.03,
    duration: 0.18,
    type: 'sine',
    gain: 0.09,
    attack: 0.01,
    decay: 0.14,
    slideTo: 2100,
  })
  noiseBurst(ctx, input, { start: t0 + 0.08, duration: 0.12, gain: 0.12, filterFreq: 2200 })
  bodyHit(ctx, input, t0 + 0.1, 1.2)
  powerClimb(ctx, input, t0 + 0.18, [415, 523, 622, 831], 0.105)
}

function playRiftTearDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 160,
    start: t0,
    duration: 0.6,
    type: 'sawtooth',
    gain: 0.07,
    attack: 0.08,
    decay: 0.48,
    slideTo: 50,
  })
  tone(ctx, input, {
    freq: 800,
    start: t0 + 0.06,
    duration: 0.55,
    type: 'sine',
    gain: 0.08,
    attack: 0.08,
    decay: 0.42,
    slideTo: 2600,
  })
  noiseBurst(ctx, input, { start: t0 + 0.1, duration: 0.5, gain: 0.09, filterFreq: 1700 })
  const tear = t0 + 0.55
  noiseBurst(ctx, input, {
    start: tear,
    duration: 0.16,
    gain: 0.15,
    filterFreq: 2800,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 2800,
    start: tear,
    duration: 0.22,
    type: 'sawtooth',
    gain: 0.08,
    attack: 0.002,
    decay: 0.16,
    slideTo: 80,
  })
  bodyHit(ctx, input, tear, 1.5)
  goldenWall(ctx, input, tear + 0.08, [110, 164.81, 220, 277.18, 329.63, 440])
  ;[0.2, 0.35, 0.5, 0.7].forEach((d, i) => {
    tone(ctx, input, {
      freq: 600 + (i % 2 === 0 ? 280 : -160),
      start: tear + d,
      duration: 0.2,
      type: 'triangle',
      gain: 0.065,
      attack: 0.008,
      decay: 0.15,
      slideTo: 280,
    })
  })
}

// --- Blood Pulse ---

function playBloodPulseFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 75,
    start: t0,
    duration: 0.16,
    type: 'sine',
    gain: 0.18,
    attack: 0.006,
    decay: 0.12,
    slideTo: 42,
  })
  tone(ctx, input, {
    freq: 60,
    start: t0 + 0.12,
    duration: 0.2,
    type: 'sine',
    gain: 0.16,
    attack: 0.006,
    decay: 0.16,
    slideTo: 36,
  })
  noiseBurst(ctx, input, { start: t0 + 0.04, duration: 0.1, gain: 0.09, filterFreq: 480, type: 'lowpass' })
  bodyHit(ctx, input, t0 + 0.14, 1.15)
  powerClimb(ctx, input, t0 + 0.22, [311, 392, 466, 622], 0.11)
}

function playBloodPulseDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (let i = 0; i < 6; i += 1) {
    const start = t0 + i * 0.09
    tone(ctx, input, {
      freq: 68 + i * 5,
      start,
      duration: 0.12,
      type: 'sine',
      gain: 0.12 + i * 0.015,
      attack: 0.005,
      decay: 0.09,
      slideTo: 38,
    })
    noiseBurst(ctx, input, {
      start,
      duration: 0.055,
      gain: 0.05 + i * 0.01,
      filterFreq: 420 + i * 90,
      type: 'lowpass',
    })
  }
  const hit = t0 + 0.58
  bodyHit(ctx, input, hit, 1.55)
  tone(ctx, input, {
    freq: 90,
    start: hit + 0.04,
    duration: 0.55,
    type: 'sawtooth',
    gain: 0.07,
    attack: 0.015,
    decay: 0.45,
    slideTo: 55,
  })
  noiseBurst(ctx, input, { start: hit, duration: 0.2, gain: 0.12, filterFreq: 550, type: 'lowpass' })
  goldenWall(ctx, input, hit + 0.08, [98, 147, 196, 247, 311, 392])
  tone(ctx, input, {
    freq: 196,
    start: hit + 0.2,
    duration: 1.0,
    type: 'triangle',
    gain: 0.09,
    attack: 0.05,
    decay: 0.85,
  })
}

// --- Ki Flare ---

function playKiFlareFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 130,
    start: t0,
    duration: 0.16,
    type: 'sine',
    gain: 0.1,
    attack: 0.02,
    decay: 0.12,
    slideTo: 320,
  })
  tone(ctx, input, {
    freq: 480,
    start: t0 + 0.08,
    duration: 0.16,
    type: 'triangle',
    gain: 0.1,
    attack: 0.01,
    decay: 0.12,
    slideTo: 900,
  })
  noiseBurst(ctx, input, { start: t0 + 0.16, duration: 0.1, gain: 0.11, filterFreq: 2000 })
  bodyHit(ctx, input, t0 + 0.16, 1.25)
  powerClimb(ctx, input, t0 + 0.22, [392, 494, 587, 784], 0.115)
}

function playKiFlareDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 80,
    start: t0,
    duration: 0.5,
    type: 'sine',
    gain: 0.12,
    attack: 0.08,
    decay: 0.4,
    slideTo: 240,
  })
  tone(ctx, input, {
    freq: 160,
    start: t0 + 0.08,
    duration: 0.48,
    type: 'triangle',
    gain: 0.08,
    attack: 0.08,
    decay: 0.38,
    slideTo: 700,
  })
  noiseBurst(ctx, input, { start: t0 + 0.15, duration: 0.4, gain: 0.07, filterFreq: 1100 })
  const hit = t0 + 0.5
  noiseBurst(ctx, input, { start: hit, duration: 0.14, gain: 0.13, filterFreq: 1600 })
  tone(ctx, input, {
    freq: 360,
    start: hit,
    duration: 0.3,
    type: 'sawtooth',
    gain: 0.07,
    attack: 0.004,
    decay: 0.24,
    slideTo: 1200,
  })
  bodyHit(ctx, input, hit, 1.5)
  goldenWall(ctx, input, hit + 0.06, [130.81, 196, 261.63, 329.63, 392, 523.25])
  for (const [freq, delay, gain] of [
    [262, 0.12, 0.09],
    [392, 0.22, 0.085],
    [523, 0.32, 0.075],
    [659, 0.44, 0.065],
  ] as const) {
    tone(ctx, input, {
      freq,
      start: hit + delay,
      duration: 0.85,
      type: 'sine',
      gain,
      attack: 0.03,
      decay: 0.7,
    })
  }
}

// --- Neon Surge ---

function playNeonSurgeFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 200,
    start: t0,
    duration: 0.22,
    type: 'sawtooth',
    gain: 0.065,
    attack: 0.01,
    decay: 0.18,
    slideTo: 560,
  })
  tone(ctx, input, {
    freq: 980,
    start: t0 + 0.03,
    duration: 0.2,
    type: 'sine',
    gain: 0.11,
    attack: 0.006,
    decay: 0.16,
    slideTo: 1600,
  })
  noiseBurst(ctx, input, {
    start: t0 + 0.1,
    duration: 0.09,
    gain: 0.1,
    filterFreq: 4000,
    type: 'highpass',
  })
  bodyHit(ctx, input, t0 + 0.12, 1.15)
  powerClimb(ctx, input, t0 + 0.2, [494, 622, 740, 988], 0.11)
}

function playNeonSurgeDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 100,
    start: t0,
    duration: 0.55,
    type: 'sawtooth',
    gain: 0.065,
    attack: 0.07,
    decay: 0.42,
    slideTo: 900,
  })
  tone(ctx, input, {
    freq: 440,
    start: t0 + 0.05,
    duration: 0.55,
    type: 'sine',
    gain: 0.085,
    attack: 0.07,
    decay: 0.42,
    slideTo: 2200,
  })
  noiseBurst(ctx, input, { start: t0 + 0.1, duration: 0.45, gain: 0.09, filterFreq: 2400 })
  ;[0.18, 0.28, 0.36, 0.44].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.04,
      gain: 0.07 + i * 0.015,
      filterFreq: 3200 + i * 400,
      type: 'highpass',
    })
  })
  const hit = t0 + 0.52
  tone(ctx, input, {
    freq: 2000,
    start: hit,
    duration: 0.22,
    type: 'sine',
    gain: 0.12,
    attack: 0.002,
    decay: 0.16,
    slideTo: 180,
  })
  bodyHit(ctx, input, hit, 1.45)
  noiseBurst(ctx, input, {
    start: hit,
    duration: 0.15,
    gain: 0.13,
    filterFreq: 4500,
    type: 'highpass',
  })
  goldenWall(ctx, input, hit + 0.08, [165, 220, 277, 330, 440, 554])
  for (const [freq, delay] of [
    [440, 0.12],
    [660, 0.24],
    [880, 0.36],
    [1100, 0.5],
  ] as const) {
    tone(ctx, input, {
      freq,
      start: hit + delay,
      duration: 0.8,
      type: 'sine',
      gain: 0.07,
      attack: 0.03,
      decay: 0.65,
    })
  }
}

// --- Frost Arc ---

function playFrostArcFirst(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.12,
    gain: 0.12,
    filterFreq: 5600,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 2400,
    start: t0,
    duration: 0.16,
    type: 'sine',
    gain: 0.1,
    attack: 0.002,
    decay: 0.12,
    slideTo: 700,
  })
  tone(ctx, input, {
    freq: 1600,
    start: t0 + 0.04,
    duration: 0.18,
    type: 'triangle',
    gain: 0.085,
    attack: 0.003,
    decay: 0.14,
    slideTo: 500,
  })
  bodyHit(ctx, input, t0 + 0.05, 1.15)
  powerClimb(ctx, input, t0 + 0.16, [466, 554, 698, 932], 0.105)
  ;[0.35, 0.42, 0.5].forEach((d) => {
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.035,
      gain: 0.06,
      filterFreq: 4800,
      type: 'highpass',
    })
  })
}

function playFrostArcDouble(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.55,
    gain: 0.08,
    filterFreq: 3800,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 1500,
    start: t0,
    duration: 0.55,
    type: 'sine',
    gain: 0.08,
    attack: 0.08,
    decay: 0.42,
    slideTo: 2800,
  })
  tone(ctx, input, {
    freq: 70,
    start: t0 + 0.08,
    duration: 0.55,
    type: 'sine',
    gain: 0.12,
    attack: 0.08,
    decay: 0.42,
    slideTo: 45,
  })
  ;[0.2, 0.3, 0.38, 0.45].forEach((d, i) => {
    noiseBurst(ctx, input, {
      start: t0 + d,
      duration: 0.045,
      gain: 0.06 + i * 0.015,
      filterFreq: 5000,
      type: 'highpass',
    })
  })
  const hit = t0 + 0.55
  noiseBurst(ctx, input, {
    start: hit,
    duration: 0.16,
    gain: 0.14,
    filterFreq: 5600,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 3000,
    start: hit,
    duration: 0.22,
    type: 'sine',
    gain: 0.11,
    attack: 0.002,
    decay: 0.16,
    slideTo: 320,
  })
  bodyHit(ctx, input, hit, 1.45)
  goldenWall(ctx, input, hit + 0.08, [146.83, 220, 277.18, 349.23, 440, 554.37])
  ;[0.18, 0.32, 0.45, 0.6, 0.78].forEach((d, i) => {
    tone(ctx, input, {
      freq: 2000 - i * 200,
      start: hit + d,
      duration: 0.22,
      type: 'sine',
      gain: 0.065,
      attack: 0.003,
      decay: 0.16,
    })
    noiseBurst(ctx, input, {
      start: hit + d,
      duration: 0.04,
      gain: 0.055,
      filterFreq: 4800,
      type: 'highpass',
    })
  })
}

const PAIR_PLAYERS: Record<
  SolveSoundPairId,
  { firstTry: PairPlayer; doubleSolve: PairPlayer }
> = {
  'volt-arc': { firstTry: playVoltArcFirst, doubleSolve: playVoltArcDouble },
  'shadow-bolt': { firstTry: playShadowBoltFirst, doubleSolve: playShadowBoltDouble },
  'system-alert': { firstTry: playSystemAlertFirst, doubleSolve: playSystemAlertDouble },
  'blade-spark': { firstTry: playBladeSparkFirst, doubleSolve: playBladeSparkDouble },
  'thunder-gate': { firstTry: playThunderGateFirst, doubleSolve: playThunderGateDouble },
  'rift-tear': { firstTry: playRiftTearFirst, doubleSolve: playRiftTearDouble },
  'blood-pulse': { firstTry: playBloodPulseFirst, doubleSolve: playBloodPulseDouble },
  'ki-flare': { firstTry: playKiFlareFirst, doubleSolve: playKiFlareDouble },
  'neon-surge': { firstTry: playNeonSurgeFirst, doubleSolve: playNeonSurgeDouble },
  'frost-arc': { firstTry: playFrostArcFirst, doubleSolve: playFrostArcDouble },
}

/** Play a first-try or double-solve cue for the given (or saved) pair. */
export async function playSolveCelebrationSound(
  id: SolveCelebrationId,
  pairId: SolveSoundPairId = loadSolveSoundPairId(),
): Promise<void> {
  const pair = PAIR_PLAYERS[pairId] ?? PAIR_PLAYERS[DEFAULT_SOLVE_SOUND_PAIR]
  await withAudioContext((ctx) => {
    if (id === 'double-solve') pair.doubleSolve(ctx)
    else pair.firstTry(ctx)
  }, `solve:${pairId}:${id}`)
}
