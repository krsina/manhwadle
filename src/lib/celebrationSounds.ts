/** Short Web Audio celebration cues for milestone unlocks. */

export type CelebrationSoundId = 'sparkle' | 'fanfare' | 'crystal'

export interface CelebrationSoundOption {
  id: CelebrationSoundId
  label: string
  blurb: string
}

export const CELEBRATION_SOUND_OPTIONS: readonly CelebrationSoundOption[] = [
  {
    id: 'sparkle',
    label: 'Sparkle',
    blurb: 'Bright ascending chimes — classic game unlock.',
  },
  {
    id: 'fanfare',
    label: 'Fanfare',
    blurb: 'Short triumphant triad with a soft brass edge.',
  },
  {
    id: 'crystal',
    label: 'Crystal',
    blurb: 'Soft two-tone bell with a long shimmer.',
  },
] as const

export const DEFAULT_CELEBRATION_SOUND: CelebrationSoundId = 'sparkle'
export const CELEBRATION_SOUND_STORAGE_KEY = 'manhwadle:celebration-sound'

/** Themed SFX for Hush-Hush secrets (overrides the user celebration pick). */
export type HushSoundId =
  | 'bit8'
  | 'cave'
  | 'page'
  | 'register'
  | 'camera'
  | 'danger'
  | 'pride'
  | 'wilt'
  | 'perfect'
  | 'tick'
  | 'night'
  | 'gates'
  | 'sneak'
  | 'glitch'
  | 'throne'
  | 'zen'
  | 'reload'
  | 'shadow'
  | 'switch'
  | 'send'
  | 'scratch'
  | 'turbo'
  | 'ember'
  | 'echo'
  | 'slam'
  | 'curtain'
  | 'cascade'
  | 'dawn'

export const HUSH_SOUND_BY_ACHIEVEMENT: Readonly<Record<string, HushSoundId>> = {
  secret_konami: 'bit8',
  secret_background: 'cave',
  secret_authors_note: 'page',
  secret_shopaholic: 'register',
  secret_tourist: 'camera',
  secret_hard_mode: 'danger',
  secret_hint_denied: 'pride',
  secret_surrender: 'wilt',
  secret_perfect: 'perfect',
  secret_last_second: 'tick',
  secret_night_owl: 'night',
  secret_four_roads: 'gates',
  secret_lurker: 'sneak',
  secret_identity: 'glitch',
  secret_reauth: 'throne',
  secret_idle: 'zen',
  secret_refresh: 'reload',
  secret_dark: 'shadow',
  secret_lights: 'switch',
  secret_share: 'send',
  secret_wrong_genre: 'scratch',
  secret_speedrun: 'turbo',
  secret_slow_burn: 'ember',
  secret_tab_twin: 'echo',
  secret_escapist: 'slam',
  secret_account_menu: 'curtain',
  secret_cascade: 'cascade',
  secret_early_bird: 'dawn',
  visit_comeback_1: 'dawn',
  visit_comeback_3: 'ember',
  visit_comeback_5: 'echo',
  visit_comeback_10: 'throne',
  visit_timeskip: 'tick',
}

let sharedCtx: AudioContext | null = null
let lastPlayKey: string | null = null
let lastPlayAt = 0

function isCelebrationSoundId(value: unknown): value is CelebrationSoundId {
  return value === 'sparkle' || value === 'fanfare' || value === 'crystal'
}

export function loadCelebrationSoundId(): CelebrationSoundId {
  try {
    const raw = localStorage.getItem(CELEBRATION_SOUND_STORAGE_KEY)
    if (isCelebrationSoundId(raw)) return raw
  } catch {
    // Ignore private mode / storage failures
  }
  return DEFAULT_CELEBRATION_SOUND
}

export function saveCelebrationSoundId(id: CelebrationSoundId): void {
  try {
    localStorage.setItem(CELEBRATION_SOUND_STORAGE_KEY, id)
  } catch {
    // Ignore quota / private mode failures
  }
}

export function hushSoundForAchievement(achievementId: string): HushSoundId | null {
  return HUSH_SOUND_BY_ACHIEVEMENT[achievementId] ?? null
}

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
  env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  src.connect(filter)
  filter.connect(env)
  env.connect(dest)
  src.start(start)
  src.stop(start + duration + 0.02)
}

function masterBus(ctx: AudioContext): GainNode {
  const input = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.knee.value = 12
  comp.ratio.value = 3
  comp.attack.value = 0.005
  comp.release.value = 0.12
  input.gain.value = 0.85
  input.connect(comp)
  comp.connect(ctx.destination)
  return input
}

function playSparkle(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => {
    const start = t0 + i * 0.085
    tone(ctx, input, {
      freq,
      start,
      duration: 0.42,
      type: 'triangle',
      gain: 0.11 - i * 0.012,
      attack: 0.01,
      decay: 0.28,
    })
    tone(ctx, input, {
      freq: freq * 2,
      start,
      duration: 0.22,
      type: 'sine',
      gain: 0.035,
      attack: 0.008,
      decay: 0.14,
    })
  })
}

function playFanfare(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  const chord = [
    { freq: 392.0, start: 0 },
    { freq: 493.88, start: 0.07 },
    { freq: 587.33, start: 0.14 },
    { freq: 783.99, start: 0.28 },
  ]
  for (const note of chord) {
    const start = t0 + note.start
    tone(ctx, input, {
      freq: note.freq,
      start,
      duration: 0.55,
      type: 'sawtooth',
      gain: 0.055,
      attack: 0.02,
      decay: 0.4,
    })
    tone(ctx, input, {
      freq: note.freq,
      start,
      duration: 0.5,
      type: 'triangle',
      gain: 0.09,
      attack: 0.015,
      decay: 0.35,
    })
  }
}

function playCrystal(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  const root = 698.46
  const fifth = 1046.5
  for (const [freq, delay, gain] of [
    [root, 0, 0.13],
    [fifth, 0.12, 0.1],
    [root * 2, 0.05, 0.04],
    [fifth * 2, 0.18, 0.03],
  ] as const) {
    tone(ctx, input, {
      freq,
      start: t0 + delay,
      duration: 0.95,
      type: 'sine',
      gain,
      attack: 0.02,
      decay: 0.75,
    })
  }
}

/** NES-style square arpeggio — classic cheat-code energy. */
function playBit8(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  // Mini power-up: A4 C5 E5 A5 + staccato confirm
  const melody = [
    { f: 440, t: 0, d: 0.09 },
    { f: 523.25, t: 0.09, d: 0.09 },
    { f: 659.25, t: 0.18, d: 0.09 },
    { f: 880, t: 0.27, d: 0.16 },
    { f: 1174.7, t: 0.46, d: 0.22 },
  ]
  for (const n of melody) {
    tone(ctx, input, {
      freq: n.f,
      start: t0 + n.t,
      duration: n.d,
      type: 'square',
      gain: 0.07,
      attack: 0.004,
      decay: 0.08,
    })
  }
  noiseBurst(ctx, input, { start: t0 + 0.45, duration: 0.06, gain: 0.04, filterFreq: 3200 })
}

function playCave(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 110,
    start: t0,
    duration: 1.1,
    type: 'sine',
    gain: 0.1,
    attack: 0.15,
    decay: 0.9,
  })
  tone(ctx, input, {
    freq: 164.81,
    start: t0 + 0.2,
    duration: 0.9,
    type: 'triangle',
    gain: 0.05,
    attack: 0.2,
    decay: 0.7,
  })
}

function playPage(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.12,
    gain: 0.07,
    filterFreq: 2400,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 620,
    start: t0 + 0.08,
    duration: 0.35,
    type: 'triangle',
    gain: 0.07,
    attack: 0.01,
    decay: 0.25,
    slideTo: 480,
  })
}

function playRegister(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 1318.5,
    start: t0,
    duration: 0.08,
    type: 'square',
    gain: 0.06,
    attack: 0.003,
    decay: 0.05,
  })
  tone(ctx, input, {
    freq: 1760,
    start: t0 + 0.09,
    duration: 0.22,
    type: 'square',
    gain: 0.07,
    attack: 0.004,
    decay: 0.16,
  })
  noiseBurst(ctx, input, { start: t0 + 0.28, duration: 0.08, gain: 0.05, filterFreq: 900 })
}

function playCamera(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.05,
    gain: 0.1,
    filterFreq: 1200,
    type: 'lowpass',
  })
  tone(ctx, input, {
    freq: 980,
    start: t0 + 0.06,
    duration: 0.4,
    type: 'sine',
    gain: 0.09,
    attack: 0.01,
    decay: 0.3,
  })
  tone(ctx, input, {
    freq: 1470,
    start: t0 + 0.12,
    duration: 0.35,
    type: 'sine',
    gain: 0.05,
    attack: 0.01,
    decay: 0.28,
  })
}

function playDanger(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (const [f, delay] of [
    [180, 0],
    [160, 0.14],
    [140, 0.28],
  ] as const) {
    tone(ctx, input, {
      freq: f,
      start: t0 + delay,
      duration: 0.22,
      type: 'sawtooth',
      gain: 0.07,
      attack: 0.01,
      decay: 0.16,
    })
  }
  tone(ctx, input, {
    freq: 420,
    start: t0 + 0.48,
    duration: 0.35,
    type: 'square',
    gain: 0.05,
    attack: 0.01,
    decay: 0.25,
  })
}

function playPride(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 392,
    start: t0,
    duration: 0.12,
    type: 'triangle',
    gain: 0.08,
    attack: 0.008,
    decay: 0.08,
  })
  tone(ctx, input, {
    freq: 311,
    start: t0 + 0.12,
    duration: 0.14,
    type: 'triangle',
    gain: 0.07,
    attack: 0.008,
    decay: 0.1,
  })
  tone(ctx, input, {
    freq: 523.25,
    start: t0 + 0.32,
    duration: 0.45,
    type: 'sine',
    gain: 0.1,
    attack: 0.02,
    decay: 0.35,
  })
}

function playWilt(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 349.23,
    start: t0,
    duration: 0.55,
    type: 'sawtooth',
    gain: 0.06,
    attack: 0.03,
    decay: 0.45,
    slideTo: 185,
  })
  tone(ctx, input, {
    freq: 220,
    start: t0 + 0.35,
    duration: 0.5,
    type: 'triangle',
    gain: 0.05,
    attack: 0.04,
    decay: 0.4,
    slideTo: 110,
  })
}

function playPerfect(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (const [f, delay, g] of [
    [880, 0, 0.1],
    [1320, 0.05, 0.08],
    [1760, 0.1, 0.06],
  ] as const) {
    tone(ctx, input, {
      freq: f,
      start: t0 + delay,
      duration: 0.5,
      type: 'sine',
      gain: g,
      attack: 0.006,
      decay: 0.4,
    })
  }
}

function playTick(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (let i = 0; i < 4; i += 1) {
    tone(ctx, input, {
      freq: 900 + i * 20,
      start: t0 + i * 0.11,
      duration: 0.05,
      type: 'square',
      gain: 0.045,
      attack: 0.002,
      decay: 0.04,
    })
  }
  tone(ctx, input, {
    freq: 1174.7,
    start: t0 + 0.5,
    duration: 0.4,
    type: 'triangle',
    gain: 0.1,
    attack: 0.01,
    decay: 0.3,
  })
}

function playNight(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 246.94,
    start: t0,
    duration: 0.7,
    type: 'sine',
    gain: 0.09,
    attack: 0.08,
    decay: 0.55,
  })
  tone(ctx, input, {
    freq: 185,
    start: t0 + 0.25,
    duration: 0.55,
    type: 'triangle',
    gain: 0.05,
    attack: 0.1,
    decay: 0.45,
    slideTo: 140,
  })
}

function playGates(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  const gates = [392, 440, 493.88, 587.33]
  gates.forEach((freq, i) => {
    tone(ctx, input, {
      freq,
      start: t0 + i * 0.1,
      duration: 0.28,
      type: 'triangle',
      gain: 0.08,
      attack: 0.01,
      decay: 0.2,
    })
  })
}

function playSneak(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (const [f, delay] of [
    [520, 0],
    [490, 0.16],
    [560, 0.34],
  ] as const) {
    tone(ctx, input, {
      freq: f,
      start: t0 + delay,
      duration: 0.14,
      type: 'sine',
      gain: 0.045,
      attack: 0.02,
      decay: 0.1,
    })
  }
}

function playGlitch(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  const steps = [600, 480, 720, 360, 840, 540]
  steps.forEach((freq, i) => {
    tone(ctx, input, {
      freq,
      start: t0 + i * 0.05,
      duration: 0.06,
      type: 'square',
      gain: 0.05,
      attack: 0.002,
      decay: 0.04,
    })
  })
  tone(ctx, input, {
    freq: 660,
    start: t0 + 0.35,
    duration: 0.35,
    type: 'triangle',
    gain: 0.08,
    attack: 0.02,
    decay: 0.28,
  })
}

function playThrone(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (const [f, delay, g] of [
    [261.63, 0, 0.08],
    [329.63, 0.12, 0.08],
    [392, 0.24, 0.09],
    [523.25, 0.4, 0.1],
  ] as const) {
    tone(ctx, input, {
      freq: f,
      start: t0 + delay,
      duration: 0.55,
      type: 'sawtooth',
      gain: g * 0.55,
      attack: 0.02,
      decay: 0.4,
    })
    tone(ctx, input, {
      freq: f,
      start: t0 + delay,
      duration: 0.5,
      type: 'triangle',
      gain: g,
      attack: 0.015,
      decay: 0.35,
    })
  }
}

function playZen(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 196,
    start: t0,
    duration: 1.2,
    type: 'sine',
    gain: 0.1,
    attack: 0.2,
    decay: 1,
  })
  tone(ctx, input, {
    freq: 294,
    start: t0 + 0.15,
    duration: 1.05,
    type: 'sine',
    gain: 0.04,
    attack: 0.25,
    decay: 0.9,
  })
}

function playReload(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 300,
    start: t0,
    duration: 0.2,
    type: 'sawtooth',
    gain: 0.05,
    attack: 0.01,
    decay: 0.15,
    slideTo: 900,
  })
  noiseBurst(ctx, input, { start: t0 + 0.18, duration: 0.1, gain: 0.06, filterFreq: 2000 })
  tone(ctx, input, {
    freq: 740,
    start: t0 + 0.28,
    duration: 0.25,
    type: 'triangle',
    gain: 0.07,
    attack: 0.01,
    decay: 0.18,
  })
}

function playShadow(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 80,
    start: t0,
    duration: 0.9,
    type: 'sine',
    gain: 0.12,
    attack: 0.08,
    decay: 0.75,
  })
  tone(ctx, input, {
    freq: 120,
    start: t0 + 0.1,
    duration: 0.7,
    type: 'triangle',
    gain: 0.05,
    attack: 0.1,
    decay: 0.55,
  })
}

function playSwitch(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.04,
    gain: 0.09,
    filterFreq: 2800,
    type: 'highpass',
  })
  tone(ctx, input, {
    freq: 220,
    start: t0 + 0.05,
    duration: 0.55,
    type: 'sine',
    gain: 0.1,
    attack: 0.04,
    decay: 0.45,
    slideTo: 880,
  })
  tone(ctx, input, {
    freq: 1320,
    start: t0 + 0.35,
    duration: 0.4,
    type: 'sine',
    gain: 0.05,
    attack: 0.02,
    decay: 0.32,
  })
}

function playSend(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 500,
    start: t0,
    duration: 0.28,
    type: 'triangle',
    gain: 0.08,
    attack: 0.01,
    decay: 0.2,
    slideTo: 1200,
  })
  noiseBurst(ctx, input, { start: t0 + 0.15, duration: 0.12, gain: 0.04, filterFreq: 2500 })
}

function playScratch(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 400,
    start: t0,
    duration: 0.22,
    type: 'sawtooth',
    gain: 0.07,
    attack: 0.005,
    decay: 0.18,
    slideTo: 120,
  })
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.18,
    gain: 0.06,
    filterFreq: 700,
    type: 'bandpass',
  })
  tone(ctx, input, {
    freq: 330,
    start: t0 + 0.28,
    duration: 0.2,
    type: 'square',
    gain: 0.04,
    attack: 0.01,
    decay: 0.15,
  })
}

function playTurbo(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (let i = 0; i < 8; i += 1) {
    tone(ctx, input, {
      freq: 400 + i * 90,
      start: t0 + i * 0.045,
      duration: 0.07,
      type: 'square',
      gain: 0.045,
      attack: 0.002,
      decay: 0.05,
    })
  }
  tone(ctx, input, {
    freq: 1320,
    start: t0 + 0.4,
    duration: 0.28,
    type: 'triangle',
    gain: 0.08,
    attack: 0.01,
    decay: 0.2,
  })
}

function playEmber(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  tone(ctx, input, {
    freq: 180,
    start: t0,
    duration: 1.0,
    type: 'sawtooth',
    gain: 0.05,
    attack: 0.25,
    decay: 0.8,
    slideTo: 360,
  })
  tone(ctx, input, {
    freq: 270,
    start: t0 + 0.3,
    duration: 0.85,
    type: 'triangle',
    gain: 0.06,
    attack: 0.3,
    decay: 0.65,
    slideTo: 540,
  })
}

function playEcho(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  for (const [delay, gain] of [
    [0, 0.09],
    [0.16, 0.06],
    [0.32, 0.035],
  ] as const) {
    tone(ctx, input, {
      freq: 698.46,
      start: t0 + delay,
      duration: 0.35,
      type: 'sine',
      gain,
      attack: 0.01,
      decay: 0.28,
    })
    tone(ctx, input, {
      freq: 880,
      start: t0 + delay + 0.04,
      duration: 0.3,
      type: 'sine',
      gain: gain * 0.7,
      attack: 0.01,
      decay: 0.24,
    })
  }
}

function playSlam(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.08,
    gain: 0.1,
    filterFreq: 400,
    type: 'lowpass',
  })
  tone(ctx, input, {
    freq: 140,
    start: t0,
    duration: 0.25,
    type: 'sine',
    gain: 0.12,
    attack: 0.005,
    decay: 0.2,
    slideTo: 70,
  })
  tone(ctx, input, {
    freq: 520,
    start: t0 + 0.18,
    duration: 0.2,
    type: 'triangle',
    gain: 0.04,
    attack: 0.01,
    decay: 0.15,
  })
}

function playCurtain(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.25,
    gain: 0.05,
    filterFreq: 1600,
    type: 'bandpass',
  })
  for (const [f, delay] of [
    [523.25, 0.1],
    [659.25, 0.22],
    [783.99, 0.34],
  ] as const) {
    tone(ctx, input, {
      freq: f,
      start: t0 + delay,
      duration: 0.45,
      type: 'triangle',
      gain: 0.07,
      attack: 0.02,
      decay: 0.35,
    })
  }
}

/** Soft morning chime: rising dawn tones for Early Bird. */
function playDawn(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.18,
    gain: 0.028,
    filterFreq: 1800,
    type: 'bandpass',
  })
  const notes = [
    { freq: 523.25, delay: 0, gain: 0.07 },
    { freq: 659.25, delay: 0.1, gain: 0.065 },
    { freq: 783.99, delay: 0.2, gain: 0.06 },
    { freq: 1046.5, delay: 0.34, gain: 0.045 },
  ] as const
  for (const note of notes) {
    const start = t0 + note.delay
    tone(ctx, input, {
      freq: note.freq,
      start,
      duration: 0.42,
      type: 'sine',
      gain: note.gain,
      attack: 0.02,
      decay: 0.32,
    })
    tone(ctx, input, {
      freq: note.freq * 2,
      start,
      duration: 0.22,
      type: 'triangle',
      gain: note.gain * 0.35,
      attack: 0.01,
      decay: 0.16,
    })
  }
}

/** Multiple seals stacking: quick successive plinks that ring together. */
function playCascade(ctx: AudioContext): void {
  const input = masterBus(ctx)
  const t0 = ctx.currentTime + 0.02
  noiseBurst(ctx, input, {
    start: t0,
    duration: 0.12,
    gain: 0.045,
    filterFreq: 2400,
    type: 'bandpass',
  })
  const drops = [
    { freq: 987.77, delay: 0 },
    { freq: 783.99, delay: 0.07 },
    { freq: 659.25, delay: 0.14 },
  ] as const
  for (const drop of drops) {
    const start = t0 + drop.delay
    tone(ctx, input, {
      freq: drop.freq,
      start,
      duration: 0.28,
      type: 'triangle',
      gain: 0.09,
      attack: 0.005,
      decay: 0.2,
      slideTo: drop.freq * 0.92,
    })
    tone(ctx, input, {
      freq: drop.freq * 2,
      start,
      duration: 0.14,
      type: 'sine',
      gain: 0.03,
      attack: 0.004,
      decay: 0.1,
    })
  }
  // All three seals ringing together.
  const stackAt = t0 + 0.28
  for (const [freq, gain] of [
    [523.25, 0.07],
    [659.25, 0.065],
    [783.99, 0.055],
    [1046.5, 0.04],
  ] as const) {
    tone(ctx, input, {
      freq,
      start: stackAt,
      duration: 0.55,
      type: 'sine',
      gain,
      attack: 0.015,
      decay: 0.42,
    })
  }
}

function playHushSound(ctx: AudioContext, id: HushSoundId): void {
  switch (id) {
    case 'bit8':
      playBit8(ctx)
      break
    case 'cave':
      playCave(ctx)
      break
    case 'page':
      playPage(ctx)
      break
    case 'register':
      playRegister(ctx)
      break
    case 'camera':
      playCamera(ctx)
      break
    case 'danger':
      playDanger(ctx)
      break
    case 'pride':
      playPride(ctx)
      break
    case 'wilt':
      playWilt(ctx)
      break
    case 'perfect':
      playPerfect(ctx)
      break
    case 'tick':
      playTick(ctx)
      break
    case 'night':
      playNight(ctx)
      break
    case 'gates':
      playGates(ctx)
      break
    case 'sneak':
      playSneak(ctx)
      break
    case 'glitch':
      playGlitch(ctx)
      break
    case 'throne':
      playThrone(ctx)
      break
    case 'zen':
      playZen(ctx)
      break
    case 'reload':
      playReload(ctx)
      break
    case 'shadow':
      playShadow(ctx)
      break
    case 'switch':
      playSwitch(ctx)
      break
    case 'send':
      playSend(ctx)
      break
    case 'scratch':
      playScratch(ctx)
      break
    case 'turbo':
      playTurbo(ctx)
      break
    case 'ember':
      playEmber(ctx)
      break
    case 'echo':
      playEcho(ctx)
      break
    case 'slam':
      playSlam(ctx)
      break
    case 'curtain':
      playCurtain(ctx)
      break
    case 'cascade':
      playCascade(ctx)
      break
    case 'dawn':
      playDawn(ctx)
      break
  }
}

async function withAudioContext(play: (ctx: AudioContext) => void, debounceKey: string): Promise<void> {
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

/** Play the given celebration cue (or the saved preference when omitted). */
export async function playCelebrationSound(
  id: CelebrationSoundId = loadCelebrationSoundId(),
): Promise<void> {
  await withAudioContext((ctx) => {
    switch (id) {
      case 'sparkle':
        playSparkle(ctx)
        break
      case 'fanfare':
        playFanfare(ctx)
        break
      case 'crystal':
        playCrystal(ctx)
        break
    }
  }, `pref:${id}`)
}

/** Unlock SFX: Hush-Hush secrets get themed cues; others use the user preference. */
export async function playAchievementUnlockSound(award: {
  id: string
  category: string
}): Promise<void> {
  if (award.category === 'secret') {
    const hush = hushSoundForAchievement(award.id)
    if (hush) {
      await withAudioContext((ctx) => playHushSound(ctx, hush), `hush:${hush}:${award.id}`)
      return
    }
  }
  await playCelebrationSound()
}
